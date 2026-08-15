import type { FeeKnowledgeIntelligenceRecord, FeeKnowledgeResolutionRequirement } from "./feeKnowledgeTypes.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalFeeActionability,
  CanonicalFeeCategory,
  CanonicalFeeClassificationConfidence,
  CanonicalFeeClassificationResolution,
  CanonicalFeeParty,
  CanonicalFeeRow,
  CanonicalMerchantAttentionActionToolkit,
  CanonicalMerchantAttentionEvidenceStatus,
  CanonicalMerchantAttentionItem,
  CanonicalMerchantAttentionModel,
  CanonicalMerchantAttentionPriority,
  CanonicalMerchantAttentionResolutionRequirement,
  CanonicalMerchantAttentionSafeActionType,
  CanonicalMerchantAttentionType,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "./types.js";

export const MERCHANT_ATTENTION_POLICY_VERSION = "canonical_merchant_attention_v1" as const;
export const MERCHANT_ATTENTION_LANGUAGE_ELIGIBILITY_POLICY_VERSION = "merchant_attention_language_eligibility_v1" as const;

type MerchantAttentionInput = Pick<
  CanonicalStatementAnalysis,
  | "financialFacts"
  | "feeLedger"
  | "feeOwnershipActionability"
  | "opportunityEngine"
  | "aiCapabilities"
  | "customerState"
  | "evidence"
>;

export type MerchantAttentionBuildOptions = {
  feeKnowledgeIntelligence?: readonly FeeKnowledgeIntelligenceRecord[];
};

type WholeStatementBridge = {
  outputRef: string;
  output: CanonicalAiWholeStatementFeeIntelligenceOutput;
};

type RowIntelligence = {
  bridge: WholeStatementBridge;
  interpretation: CanonicalAiWholeStatementFeeIntelligenceOutput["rowInterpretations"][number] | null;
  acceptance: CanonicalAiWholeStatementFeeIntelligenceOutput["acceptanceRecords"][number] | null;
};

type ResolvedRowMeaning = {
  category: CanonicalFeeCategory;
  economicBeneficiary: CanonicalFeeParty;
  contractualController: CanonicalFeeParty;
  actionabilityCeiling: CanonicalFeeActionability;
  confidence: CanonicalFeeClassificationConfidence;
  conclusionBasis: "deterministic_policy" | "admitted_intelligence";
  intelligenceRefs: string[];
  reasonRefs: string[];
  conflicts: string[];
  missingEvidence: string[];
  publicDocumentationSupported: boolean;
};

export function buildCanonicalMerchantAttentionModel(
  input: MerchantAttentionInput,
  options: MerchantAttentionBuildOptions = {},
): CanonicalMerchantAttentionModel {
  const evidenceIds = new Set(input.evidence.map((record) => record.id));
  const classifications = new Map(input.feeOwnershipActionability.rowClassifications.map((row) => [row.feeRowId, row]));
  const wholeStatement = admittedWholeStatementBridge(input);
  const feeKnowledgeByRow = admittedFeeKnowledgeByRow(options.feeKnowledgeIntelligence ?? []);
  const feeItems = input.feeLedger.rows
    .filter(eligibleFeeRow)
    .map((row) => buildFeeAttentionItem({
      input,
      row,
      classification: classifications.get(row.id) ?? null,
      rowIntelligence: wholeStatement ? intelligenceForRow(wholeStatement, row.id) : null,
      feeKnowledge: feeKnowledgeByRow.get(row.id) ?? [],
      evidenceIds,
    }));
  const pricingItem = buildStatementPricingAttentionItem(input, evidenceIds);
  const items = [...feeItems, ...(pricingItem ? [pricingItem] : [])].sort(compareAttentionItems);
  const unresolved = items.some((item) => item.conflict.status === "unresolved" || item.evidenceStatus === "unresolved");
  const languageEligibleCount = items.filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation).length;
  const status: CanonicalMerchantAttentionModel["status"] = items.length === 0
    ? "empty"
    : input.feeLedger.status === "available" && !unresolved
      ? "available"
      : "partial";

  return {
    policyVersion: MERCHANT_ATTENTION_POLICY_VERSION,
    status,
    items,
    summary: {
      itemCount: items.length,
      highPriorityCount: items.filter((item) => item.priority === "high_priority").length,
      reviewCount: items.filter((item) => item.priority === "review").length,
      routineCount: items.filter((item) => item.priority === "routine").length,
      questionCount: items.filter((item) => item.questionToResolve !== null).length,
      actionToolkitCount: items.filter((item) => item.actionToolkit !== null).length,
    },
    sourcePolicyVersions: {
      feeLedger: "canonical_fee_ledger_v1",
      ownershipActionability: "fee_ownership_actionability_v1",
      opportunityEngine: "canonical_opportunity_engine_v1",
      aiCapabilityBoundary: "canonical_ai_capability_boundary_v1",
      customerBenchmark: "canonical_customer_benchmark_policy_v1",
    },
    interpretation: {
      policyVersion: "merchant_attention_ai_interpretation_v1",
      normalPathRequirement: "ai_interpretation_required",
      source: "deterministic_fallback",
      readiness: "degraded_fallback",
      authoritative: false,
      financialMutationAllowed: false,
      outputRef: null,
      admission: {
        schemaValidated: false,
        canonicalLinkageValidated: false,
        actionabilityCeilingValidated: false,
        privacyValidated: false,
        reasonCodes: ["merchant_attention_ai_interpretation_unavailable"],
      },
      coverage: {
        policyVersion: MERCHANT_ATTENTION_LANGUAGE_ELIGIBILITY_POLICY_VERSION,
        eligibleItemCount: languageEligibleCount,
        admittedItemCount: 0,
        deterministicRoutineItemCount: items.length - languageEligibleCount,
        exactEligibleCoverage: false,
      },
      fallbackReasonCodes: ["merchant_attention_ai_interpretation_unavailable"],
    },
    limitations: [
      "Attention identifies charges or pricing issues worth understanding; it does not by itself establish removability, negotiability, overcharging, or savings.",
      "Opportunity references are linkage-only and never recalculate or expand canonical opportunity money.",
      "Unavailable evidence and rejected or failed intelligence remain unavailable and cannot strengthen merchant guidance.",
    ],
  };
}

function buildFeeAttentionItem(input: {
  input: MerchantAttentionInput;
  row: CanonicalFeeRow;
  classification: CanonicalFeeClassificationResolution | null;
  rowIntelligence: RowIntelligence | null;
  feeKnowledge: readonly FeeKnowledgeIntelligenceRecord[];
  evidenceIds: Set<string>;
}): CanonicalMerchantAttentionItem {
  const selected = input.classification?.selected ?? null;
  const meaning = resolveRowMeaning(input.classification, input.rowIntelligence);
  const label = input.row.selectedLabel.trim();
  const feeKnowledgeRequirement = strongestFeeKnowledgeRequirement(input.feeKnowledge.map((record) => record.resolutionRequirement));
  const conflict = conflictFor(input.classification, meaning);
  const preliminaryType = attentionTypeFor(label, meaning.category, meaning.economicBeneficiary, meaning.actionabilityCeiling);
  const resolution = resolutionFor({
    label,
    category: meaning.category,
    attentionType: preliminaryType,
    documentationRequirement: selected?.documentationRequirement ?? "blocking",
    conflictStatus: conflict.status,
    missingEvidence: meaning.missingEvidence,
    feeKnowledgeRequirement,
  });
  const attentionType = resolution.requirement === "additional_statement_history_required" && preliminaryType === "informational"
    ? "monitor"
    : preliminaryType;
  const evidenceStatus = evidenceStatusFor({
    resolutionRequirement: resolution.requirement,
    admittedIntelligence: meaning.conclusionBasis === "admitted_intelligence",
    publicDocumentationSupported: meaning.publicDocumentationSupported,
  });
  const evidenceRefs = unique([
    ...input.row.contributionDecision.evidenceRefs,
    ...(input.classification?.candidates.find((candidate) => candidate.id === selected?.candidateId)?.evidenceRefs ?? []),
    ...(meaning.conclusionBasis === "admitted_intelligence"
      ? input.rowIntelligence?.acceptance?.evidenceRefs ?? []
      : []),
    ...input.feeKnowledge.flatMap((record) => record.basis.statementEvidenceRefs),
  ]).filter((ref) => input.evidenceIds.has(ref)).sort();
  const opportunityLink = supportedOpportunityLink(input.input, input.row.id);
  const strongestExistingAction = supportedExistingStrongAction(input.input, input.row.id, opportunityLink?.componentRefs ?? []);
  const safestAction = safestActionFor({
    attentionType,
    ceiling: meaning.actionabilityCeiling,
    strongestExistingAction,
  });
  const conclusion = conclusionFor(label, meaning.category, attentionType, meaning.economicBeneficiary);
  const uncertainty = uncertaintyFor({
    label,
    attentionType,
    category: meaning.category,
    missingEvidence: meaning.missingEvidence,
    conflictSummary: conflict.summary,
  });
  const priority = priorityFor({
    amount: input.row.selectedAmount,
    totalFees: input.input.financialFacts.totalFees.value,
    attentionType,
    ceiling: meaning.actionabilityCeiling,
    conflictStatus: conflict.status,
  });
  const id = `attention_fee_${input.row.id}`;
  const instruction = actionInstruction(safestAction, attentionType);
  const documentationNeeded = resolution.documentationNeeded;
  const questionToResolve = resolution.requirement === "no_additional_evidence_required" && conflict.status !== "unresolved"
    ? null
    : {
        questionId: `question_${id}`,
        attentionItemId: id,
        question: questionFor(attentionType, label),
        amountUnderReview: cloneMoney(input.row.selectedAmount),
        whatRateRevealKnows: statementKnowledge(label, input.row.selectedAmount),
        whatRemainsUncertain: uncertainty[0] ?? "The available statement does not establish the complete pricing or service context.",
        safeNextStep: instruction,
        requirement: resolution.requirement,
        requiredEvidenceOrConfirmation: documentationNeeded,
        evidenceRefs,
        reasonRefs: unique([...(input.classification ? [input.classification.selected.candidateId] : []), ...meaning.reasonRefs]).sort(),
        amountIsSavings: false as const,
      };
  const toolkit = safestAction === "no_action"
    ? null
    : actionToolkitFor({
        itemId: id,
        actionType: safestAction,
        attentionType,
        evidenceRefs,
        instruction,
        documentationNeeded,
      });
  const priorityFinding = priority === "high_priority" || (priority === "review" && attentionType !== "informational" && evidenceRefs.length > 0);
  const merchantLanguageEligibility = languageEligibilityFor({
    scope: "fee_row",
    priorityFinding,
    questionToResolve: questionToResolve !== null,
    actionToolkit: toolkit !== null,
    inventoryDisposition: conflict.status === "unresolved"
      ? "unresolved_review"
      : priority === "routine"
        ? "routine_context"
        : "attention_review",
    priority,
    attentionType,
  });

  return {
    id,
    policyVersion: MERCHANT_ATTENTION_POLICY_VERSION,
    scope: "fee_row",
    feeRowIds: [input.row.id],
    merchantTitle: titleFor(label, meaning.category, attentionType),
    whyThisDeservesAttention: toolkitWhy(attentionType),
    originalObservedStatementLabel: label,
    observedAmount: cloneMoney(input.row.selectedAmount),
    category: meaning.category,
    likelyOwner: {
      economicBeneficiary: meaning.economicBeneficiary,
      contractualController: meaning.contractualController,
    },
    attentionType,
    priority,
    evidenceStatus,
    confidence: meaning.confidence,
    evidenceBoundary: {
      statementProof: {
        kind: "observed_charge",
        feeRowId: input.row.id,
        observedLabel: label,
        observedAmount: cloneMoney(input.row.selectedAmount),
        ratePosition: null,
        evidenceRefs,
      },
      reasonableConclusion: {
        summary: conclusion,
        basis: meaning.conclusionBasis,
        confidence: meaning.confidence,
        reasonRefs: unique([...(input.classification ? [input.classification.selected.candidateId] : []), ...meaning.reasonRefs]).sort(),
      },
      remainingUncertainty: uncertainty,
    },
    conflict,
    resolution: {
      requirement: resolution.requirement,
      merchantMeaning: resolution.merchantMeaning,
      documentationNeeded,
    },
    safestNextAction: { actionType: safestAction, instruction },
    actionabilityCeiling: meaning.actionabilityCeiling,
    opportunityLink,
    questionToResolve,
    actionToolkit: toolkit,
    surfaceEligibility: {
      priorityFinding,
      questionsToResolve: questionToResolve !== null,
      actionToolkit: toolkit !== null,
      feeInventory: true,
    },
    inventoryDisposition: conflict.status === "unresolved"
      ? "unresolved_review"
      : priority === "routine"
        ? "routine_context"
        : "attention_review",
    reasonCodes: unique([
      `attention_${attentionType}`,
      `evidence_${evidenceStatus}`,
      `priority_${priority}`,
      `resolution_${resolution.requirement}`,
    ]).sort(),
    evidenceRefs,
    sourceIntelligenceRefs: unique([
      ...meaning.intelligenceRefs,
      ...input.feeKnowledge.map((record) => record.intelligenceId),
    ]).sort(),
    merchantLanguageEligibility,
    merchantLanguageSource: "deterministic_fallback",
  };
}

function buildStatementPricingAttentionItem(
  input: MerchantAttentionInput,
  evidenceIds: Set<string>,
): CanonicalMerchantAttentionItem | null {
  const comparison = input.customerState.rateComparison;
  if (comparison.status !== "qualified" || comparison.position !== "above_reference" || !comparison.benchmarkRef) return null;
  const evidenceRefs = unique(comparison.benchmarkRef.evidenceRefs).filter((ref) => evidenceIds.has(ref)).sort();
  const id = "attention_statement_pricing_above_reference";
  const instruction = "Ask the processor to review the account's current pricing and provide the current merchant pricing schedule.";
  const question = {
    questionId: `question_${id}`,
    attentionItemId: id,
    question: "Which pricing terms and fee components explain the overall rate position?",
    amountUnderReview: null,
    whatRateRevealKnows: "The verified effective rate is above the qualified RateReveal reference range for the approved business profile.",
    whatRemainsUncertain: "The comparison alone does not identify an overcharge, contract breach, removable fee, or recoverable amount.",
    safeNextStep: instruction,
    requirement: "merchant_pricing_agreement_required" as const,
    requiredEvidenceOrConfirmation: ["Current merchant pricing agreement or pricing schedule", "Processor explanation of current pricing components"],
    evidenceRefs,
    reasonRefs: [comparison.calculationRef].filter((ref): ref is string => Boolean(ref)),
    amountIsSavings: false as const,
  };
  const toolkit = actionToolkitFor({
    itemId: id,
    actionType: "request_pricing_review",
    attentionType: "pricing_review",
    evidenceRefs,
    instruction,
    documentationNeeded: question.requiredEvidenceOrConfirmation,
  });
  return {
    id,
    policyVersion: MERCHANT_ATTENTION_POLICY_VERSION,
    scope: "statement_pricing",
    feeRowIds: [],
    merchantTitle: "Overall pricing deserves review",
    whyThisDeservesAttention: "The qualified pricing comparison provides context for review without establishing an overcharge or savings amount.",
    originalObservedStatementLabel: null,
    observedAmount: null,
    category: "statement_pricing",
    likelyOwner: null,
    attentionType: "pricing_review",
    priority: "review",
    evidenceStatus: "needs_merchant_pricing_agreement",
    confidence: comparison.benchmarkRef.confidence ?? "low",
    evidenceBoundary: {
      statementProof: {
        kind: "qualified_rate_position",
        feeRowId: null,
        observedLabel: null,
        observedAmount: null,
        ratePosition: "above_reference",
        evidenceRefs,
      },
      reasonableConclusion: {
        summary: "The verified effective rate is above the applicable RateReveal reference range and supports a pricing review.",
        basis: "qualified_reference",
        confidence: comparison.benchmarkRef.confidence ?? "low",
        reasonRefs: [comparison.calculationRef].filter((ref): ref is string => Boolean(ref)),
      },
      remainingUncertainty: ["The comparison does not identify which individual fees could change or establish any savings amount."],
    },
    conflict: { status: "none", summary: null },
    resolution: {
      requirement: "merchant_pricing_agreement_required",
      merchantMeaning: "Compare the statement with the current pricing agreement before drawing a stronger pricing conclusion.",
      documentationNeeded: question.requiredEvidenceOrConfirmation,
    },
    safestNextAction: { actionType: "request_pricing_review", instruction },
    actionabilityCeiling: "verify_only",
    opportunityLink: null,
    questionToResolve: question,
    actionToolkit: toolkit,
    surfaceEligibility: {
      priorityFinding: true,
      questionsToResolve: true,
      actionToolkit: true,
      feeInventory: false,
    },
    inventoryDisposition: "statement_level_only",
    reasonCodes: ["attention_pricing_review", "benchmark_context_only", "resolution_merchant_pricing_agreement_required"],
    evidenceRefs,
    sourceIntelligenceRefs: [],
    merchantLanguageEligibility: languageEligibilityFor({
      scope: "statement_pricing",
      priorityFinding: true,
      questionToResolve: true,
      actionToolkit: true,
      inventoryDisposition: "statement_level_only",
      priority: "review",
      attentionType: "pricing_review",
    }),
    merchantLanguageSource: "deterministic_fallback",
  };
}

function admittedWholeStatementBridge(input: MerchantAttentionInput): WholeStatementBridge | null {
  const capability = input.aiCapabilities.capabilities.find((record) =>
    record.capability === "whole_statement_fee_intelligence_review" &&
    record.status === "completed" &&
    record.groundingStatus === "grounded" &&
    record.output?.type === "whole_statement_fee_intelligence_review",
  );
  return capability?.output?.type === "whole_statement_fee_intelligence_review"
    ? { outputRef: capability.outputRef ?? "whole_statement_fee_intelligence_review", output: capability.output }
    : null;
}

function intelligenceForRow(bridge: WholeStatementBridge, feeRowId: string): RowIntelligence {
  return {
    bridge,
    interpretation: bridge.output.rowInterpretations.find((row) => row.feeRowRef === feeRowId) ?? null,
    acceptance: bridge.output.acceptanceRecords.find((row) => row.feeRowRef === feeRowId) ?? null,
  };
}

function resolveRowMeaning(
  classification: CanonicalFeeClassificationResolution | null,
  intelligence: RowIntelligence | null,
): ResolvedRowMeaning {
  const selected = classification?.selected;
  const accepted = intelligence?.acceptance && ["accepted", "accepted_with_conditions"].includes(intelligence.acceptance.status)
    ? intelligence.acceptance
    : null;
  const interpretation = accepted ? intelligence?.interpretation ?? null : null;
  const category = accepted?.acceptedSemanticFields.category ?? selected?.category ?? "unknown_needs_review";
  const economicBeneficiary = accepted?.acceptedSemanticFields.likelyEconomicOwner ?? selected?.ownership.economicBeneficiary ?? "unknown";
  const contractualController = accepted?.acceptedSemanticFields.likelyContractualController ?? selected?.ownership.contractualController ?? "unknown";
  const deterministicCeiling = selected?.actionabilityCeiling ?? "unknown";
  const admittedCeiling = accepted?.acceptedSemanticFields.actionabilityCeiling ?? accepted?.actionabilityCeiling ?? deterministicCeiling;
  const actionabilityCeiling = lowerActionability(deterministicCeiling, admittedCeiling);
  const confidence = accepted && interpretation
    ? lowerConfidence(selected?.confidence ?? "low", interpretation.confidence, accepted.status === "accepted_with_conditions" ? "medium" : "high")
    : selected?.confidence ?? "low";
  const publicDocumentationSupported = Boolean(
    accepted &&
    interpretation &&
    ["approved_external_documentation", "runtime_verified_documentation"].includes(interpretation.evidenceProvenance) &&
    interpretation.externalSourceRef &&
    interpretation.externalClaimSupportRef,
  );
  return {
    category,
    economicBeneficiary,
    contractualController,
    actionabilityCeiling,
    confidence,
    conclusionBasis: accepted ? "admitted_intelligence" : "deterministic_policy",
    intelligenceRefs: accepted && intelligence ? [intelligence.bridge.outputRef, `whole_statement_acceptance:${accepted.feeRowRef}`] : [],
    reasonRefs: accepted ? [...accepted.reasonCodes] : [],
    conflicts: unique([
      ...(["unresolved", "requires_human_review"].includes(classification?.conflictStatus ?? "none") && classification?.conflictReason
        ? [classification.conflictReason]
        : []),
      ...(accepted?.conflicts ?? []),
    ]),
    // Whole-statement missing-evidence prose is not an admitted semantic field.
    // Until that dimension has an explicit accepted representation, it has zero
    // authority over Merchant Attention resolution or merchant language.
    missingEvidence: [],
    publicDocumentationSupported,
  };
}

function languageEligibilityFor(input: {
  scope: CanonicalMerchantAttentionItem["scope"];
  priorityFinding: boolean;
  questionToResolve: boolean;
  actionToolkit: boolean;
  inventoryDisposition: CanonicalMerchantAttentionItem["inventoryDisposition"];
  priority: CanonicalMerchantAttentionPriority;
  attentionType: CanonicalMerchantAttentionType;
}): CanonicalMerchantAttentionItem["merchantLanguageEligibility"] {
  const reasonCodes = unique([
    ...(input.priorityFinding ? ["merchant_language_priority_finding"] : []),
    ...(input.questionToResolve ? ["merchant_language_question_to_resolve"] : []),
    ...(input.actionToolkit ? ["merchant_language_action_toolkit"] : []),
    ...(input.inventoryDisposition === "unresolved_review" ? ["merchant_language_unresolved_inventory"] : []),
    ...(input.scope === "statement_pricing" ? ["merchant_language_statement_pricing_review"] : []),
    ...(input.priority !== "routine" && input.attentionType !== "informational"
      ? ["merchant_language_nonroutine_attention"]
      : []),
  ]).sort();
  return {
    policyVersion: MERCHANT_ATTENTION_LANGUAGE_ELIGIBILITY_POLICY_VERSION,
    eligibleForAiInterpretation: reasonCodes.length > 0,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["merchant_language_routine_inventory_fallback"],
  };
}

function admittedFeeKnowledgeByRow(records: readonly FeeKnowledgeIntelligenceRecord[]): Map<string, FeeKnowledgeIntelligenceRecord[]> {
  const result = new Map<string, FeeKnowledgeIntelligenceRecord[]>();
  for (const record of records) {
    if (record.supersededByIntelligenceRef || record.state === "rejected" || record.displayPermission === "internal_only") continue;
    if (!record.merchantActionability.startsWith("merchant_display")) continue;
    const existing = result.get(record.feeRowRef) ?? [];
    existing.push(record);
    result.set(record.feeRowRef, existing.sort((left, right) => left.intelligenceId.localeCompare(right.intelligenceId)));
  }
  return result;
}

export function merchantAttentionResolutionFromFeeKnowledge(
  requirement: FeeKnowledgeResolutionRequirement,
): CanonicalMerchantAttentionResolutionRequirement {
  switch (requirement) {
    case "current_statement_sufficient": return "no_additional_evidence_required";
    case "public_evidence_required": return "public_documentation_required";
    case "merchant_pricing_document_required": return "merchant_pricing_agreement_required";
    case "additional_statement_history_required": return "additional_statement_history_required";
    case "deterministic_math_required": return "deterministic_math_required";
    case "public_evidence_unavailable": return "processor_explanation_required";
    case "unresolved_review_required": return "unresolved_review_required";
  }
}

function strongestFeeKnowledgeRequirement(
  requirements: readonly FeeKnowledgeResolutionRequirement[],
): CanonicalMerchantAttentionResolutionRequirement | null {
  const mapped = requirements.map(merchantAttentionResolutionFromFeeKnowledge);
  return mapped.sort((left, right) => resolutionRank(right) - resolutionRank(left))[0] ?? null;
}

function resolutionFor(input: {
  label: string;
  category: CanonicalFeeCategory;
  attentionType: CanonicalMerchantAttentionType;
  documentationRequirement: "none" | "recommended" | "required_for_authority" | "required_for_savings" | "blocking";
  conflictStatus: "none" | "resolved" | "unresolved";
  missingEvidence: string[];
  feeKnowledgeRequirement: CanonicalMerchantAttentionResolutionRequirement | null;
}): {
  requirement: CanonicalMerchantAttentionResolutionRequirement;
  merchantMeaning: string;
  documentationNeeded: string[];
} {
  const missingText = input.missingEvidence.join(" ").toLowerCase();
  let requirement = input.feeKnowledgeRequirement;
  if (input.conflictStatus === "unresolved" || input.documentationRequirement === "blocking") requirement = "unresolved_review_required";
  else if (/agreement|contract|pricing|schedule/.test(missingText)) requirement = strongerResolution(requirement, "merchant_pricing_agreement_required");
  else if (/history|another statement|additional statement|multiple statement/.test(missingText)) requirement = strongerResolution(requirement, "additional_statement_history_required");
  else if (/public|documentation|source|published/.test(missingText)) requirement = strongerResolution(requirement, "public_documentation_required");
  else if (input.missingEvidence.length > 0) requirement = strongerResolution(requirement, "processor_explanation_required");
  if (!requirement) {
    if (input.attentionType === "informational") requirement = "no_additional_evidence_required";
    else if (input.attentionType === "pricing_review" || input.attentionType === "potential_negotiation") requirement = "merchant_pricing_agreement_required";
    else if (input.attentionType === "monitor") requirement = "additional_statement_history_required";
    else if (input.documentationRequirement === "required_for_authority" || input.documentationRequirement === "required_for_savings") {
      requirement = input.category === "processor_markup" || input.category === "processor_per_item_fee"
        ? "merchant_pricing_agreement_required"
        : "processor_explanation_required";
    } else if (["explanation_or_itemization", "compliance_or_remediation", "configuration_or_payment_practice_review", "service_use_review"].includes(input.attentionType)) {
      requirement = "processor_explanation_required";
    } else requirement = "no_additional_evidence_required";
  }
  return resolutionDetails(requirement);
}

function resolutionDetails(requirement: CanonicalMerchantAttentionResolutionRequirement) {
  switch (requirement) {
    case "no_additional_evidence_required":
      return { requirement, merchantMeaning: "No additional evidence is required for this limited conclusion.", documentationNeeded: [] };
    case "public_documentation_required":
      return { requirement, merchantMeaning: "Public documentation is needed before RateReveal can make a stronger interpretation.", documentationNeeded: ["Applicable public processor or network documentation"] };
    case "merchant_pricing_agreement_required":
      return { requirement, merchantMeaning: "Compare the charge with the current merchant pricing agreement before making a stronger pricing claim.", documentationNeeded: ["Current merchant pricing agreement or pricing schedule"] };
    case "additional_statement_history_required":
      return { requirement, merchantMeaning: "Another statement period is needed to determine whether the pattern repeats.", documentationNeeded: ["At least one additional statement period"] };
    case "deterministic_math_required":
      return { requirement, merchantMeaning: "A supported calculation is required before drawing a stronger conclusion.", documentationNeeded: ["Statement inputs needed for deterministic calculation"] };
    case "processor_explanation_required":
      return { requirement, merchantMeaning: "Ask the processor to explain or itemize the charge before treating it as actionable.", documentationNeeded: ["Written processor explanation or itemization"] };
    case "unresolved_review_required":
      return { requirement, merchantMeaning: "The available evidence conflicts or remains unresolved and needs review before action.", documentationNeeded: ["Clarifying documentation or qualified review"] };
  }
}

function evidenceStatusFor(input: {
  resolutionRequirement: CanonicalMerchantAttentionResolutionRequirement;
  admittedIntelligence: boolean;
  publicDocumentationSupported: boolean;
}): CanonicalMerchantAttentionEvidenceStatus {
  if (input.resolutionRequirement === "merchant_pricing_agreement_required") return "needs_merchant_pricing_agreement";
  if (input.resolutionRequirement === "additional_statement_history_required") return "needs_additional_statement_history";
  if (input.resolutionRequirement === "processor_explanation_required") return "needs_processor_explanation";
  if (input.resolutionRequirement === "unresolved_review_required" || input.resolutionRequirement === "deterministic_math_required") return "unresolved";
  if (input.publicDocumentationSupported) return "public_documentation_supported";
  if (input.admittedIntelligence) return "supported_interpretation";
  return "statement_confirmed";
}

function attentionTypeFor(
  label: string,
  category: CanonicalFeeCategory,
  beneficiary: CanonicalFeeParty,
  ceiling: CanonicalFeeActionability,
): CanonicalMerchantAttentionType {
  const normalized = label.toLowerCase();
  if (/\bpci\b.*(?:non[ -]?compliance|non[ -]?validated)|(?:non[ -]?compliance|non[ -]?validated).*\bpci\b/.test(normalized)) return "compliance_or_remediation";
  if (/\b(?:non[ -]?qual(?:ified)?|downgrade|eirf)\b/.test(normalized)) return "configuration_or_payment_practice_review";
  if (/\b(?:gateway|gtwy|avs|batch|authorization|auth)\b/.test(normalized) && !["network", "card_brand", "issuer_or_interchange"].includes(beneficiary)) {
    return "configuration_or_payment_practice_review";
  }
  if (/\b(?:other|additional)(?:\s+fees?|\s+charges?)?\b/.test(normalized) || category === "unknown_needs_review") return "explanation_or_itemization";
  if (/\b(?:statement|paper|monthly|account|service|pci)\b/.test(normalized) || ["service_fee", "third_party_product", "equipment_or_lease", "compliance_fee"].includes(category)) {
    return "service_use_review";
  }
  if (["interchange", "card_brand_network_assessment", "network_access_or_authorization", "tax_or_government", "credit"].includes(category)) return "informational";
  if (["processor_markup", "processor_per_item_fee", "administrative_fee"].includes(category)) {
    return ceiling === "potentially_actionable" ? "potential_negotiation" : "pricing_review";
  }
  if (beneficiary === "processor") return ceiling === "potentially_actionable" ? "potential_negotiation" : "pricing_review";
  return ceiling === "not_actionable" ? "informational" : "monitor";
}

function titleFor(label: string, category: CanonicalFeeCategory, attentionType: CanonicalMerchantAttentionType): string {
  if (attentionType === "compliance_or_remediation") return "PCI compliance status needs attention";
  if (attentionType === "explanation_or_itemization") return "Unclear charge needs itemization";
  if (attentionType === "configuration_or_payment_practice_review") return /non[ -]?qual|downgrade|eirf/i.test(label)
    ? "Non-qualified pricing needs review"
    : "Processing configuration or usage needs review";
  if (attentionType === "service_use_review") return /statement|paper/i.test(label) ? "Statement delivery fee" : "Service or account charge";
  if (attentionType === "potential_negotiation") return "Processor-controlled pricing may deserve negotiation";
  if (attentionType === "pricing_review") return "Processor pricing deserves review";
  if (attentionType === "monitor") return "Charge pattern should be monitored";
  if (["interchange", "card_brand_network_assessment", "network_access_or_authorization"].includes(category)) return "Network or interchange charge";
  return "Routine statement charge";
}

function conclusionFor(
  label: string,
  category: CanonicalFeeCategory,
  attentionType: CanonicalMerchantAttentionType,
  beneficiary: CanonicalFeeParty,
): string {
  if (attentionType === "explanation_or_itemization") return "The charge is not sufficiently itemized and deserves an explanation.";
  if (attentionType === "compliance_or_remediation") return "The explicit statement label supports a compliance-remediation review, but it does not establish the cause or prove the charge is removable.";
  if (/\bpci\b/i.test(label)) return "The label supports reviewing the service or pricing terms, but it does not by itself prove merchant non-compliance.";
  if (/statement|paper/i.test(label)) return "The statement confirms a delivery or account-service charge, but it does not establish whether the fee can be changed.";
  if (/non[ -]?qual|downgrade|eirf/i.test(label)) return "The label supports investigating pricing or transaction-qualification causes, but one statement does not establish an exact cause.";
  if (attentionType === "configuration_or_payment_practice_review") return "The charge may relate to service use, configuration, or contract pricing and deserves a targeted review.";
  if (attentionType === "service_use_review") return "The statement supports reviewing whether the related service is used and how the account agreement prices it.";
  if (attentionType === "pricing_review" || attentionType === "potential_negotiation" || beneficiary === "processor") {
    return "The accepted ownership and pricing context supports a pricing review; the observed amount is not automatically an overcharge.";
  }
  if (["interchange", "card_brand_network_assessment", "network_access_or_authorization"].includes(category)) {
    return "The charge appears to be network or pass-through context and is informational unless separate evidence identifies a specific concern.";
  }
  return "The statement confirms the charge, while the available evidence supports only limited contextual guidance.";
}

function uncertaintyFor(input: {
  label: string;
  attentionType: CanonicalMerchantAttentionType;
  category: CanonicalFeeCategory;
  missingEvidence: string[];
  conflictSummary: string | null;
}): string[] {
  const values = [...input.missingEvidence];
  if (input.conflictSummary) values.push(input.conflictSummary);
  if (/non[ -]?qual|downgrade|eirf/i.test(input.label)) {
    values.push("The statement does not establish the exact qualification cause or quantify a correctable amount.");
  }
  if (values.length === 0) {
    if (input.attentionType === "informational") values.push("The statement does not establish that this charge is negotiable, removable, or incorrectly applied.");
    else if (input.attentionType === "explanation_or_itemization") values.push("The statement does not identify the service, program, or pricing term behind the charge.");
    else if (input.attentionType === "compliance_or_remediation") values.push("The statement does not establish the underlying compliance cause or the steps required to resolve it.");
    else values.push("The current statement does not establish removability, contractual error, or recoverable savings.");
  }
  return unique(values).sort();
}

function conflictFor(
  classification: CanonicalFeeClassificationResolution | null,
  meaning: ResolvedRowMeaning,
): CanonicalMerchantAttentionItem["conflict"] {
  if (
    !classification ||
    meaning.economicBeneficiary === "unknown" ||
    meaning.contractualController === "unknown" ||
    meaning.actionabilityCeiling === "unknown" ||
    ["unresolved", "requires_human_review"].includes(classification.conflictStatus) ||
    meaning.conflicts.length > 0
  ) {
    return { status: "unresolved", summary: meaning.conflicts[0] ?? classification?.conflictReason ?? "Ownership or interpretation remains unresolved." };
  }
  if (classification.conflictStatus === "resolved_by_stronger_evidence") return { status: "resolved", summary: classification.conflictReason };
  return { status: "none", summary: null };
}

function priorityFor(input: {
  amount: MoneyAmount | null;
  totalFees: MoneyAmount | null;
  attentionType: CanonicalMerchantAttentionType;
  ceiling: CanonicalFeeActionability;
  conflictStatus: "none" | "resolved" | "unresolved";
}): CanonicalMerchantAttentionPriority {
  const amountMinor = Math.abs(input.amount?.amountMinor ?? 0);
  const totalFeesMinor = Math.abs(input.totalFees?.amountMinor ?? 0);
  const materialThreshold = Math.max(1_000, Math.round(totalFeesMinor * 0.15));
  const material = amountMinor >= materialThreshold;
  const practicallyImportant = ["pricing_review", "potential_negotiation", "compliance_or_remediation"].includes(input.attentionType);
  if (material && (practicallyImportant || input.ceiling === "potentially_actionable" || input.conflictStatus === "unresolved")) return "high_priority";
  if (input.attentionType !== "informational" || input.conflictStatus === "unresolved") return "review";
  return "routine";
}

function supportedOpportunityLink(input: MerchantAttentionInput, feeRowId: string): CanonicalMerchantAttentionItem["opportunityLink"] {
  const componentRefs = input.opportunityEngine.components
    .filter((component) =>
      component.inclusionStatus === "included" &&
      (component.eligibility === "deterministic" || component.eligibility === "approved_estimate") &&
      component.feeRowRefs.some((ref) => ref.feeRowId === feeRowId),
    )
    .map((component) => component.id)
    .sort();
  return componentRefs.length > 0 ? { componentRefs, linkageOnly: true, moneyRecomputed: false } : null;
}

function supportedExistingStrongAction(
  input: MerchantAttentionInput,
  feeRowId: string,
  componentRefs: readonly string[],
): "request_removal" | "request_repricing" | null {
  const action = input.customerState.actionGuidance.find((candidate) =>
    (candidate.actionType === "request_removal" || candidate.actionType === "request_repricing") &&
    candidate.feeRowRefs.includes(feeRowId) &&
    candidate.opportunityComponentRefs.some((ref) => componentRefs.includes(ref)),
  );
  return action?.actionType === "request_removal" || action?.actionType === "request_repricing" ? action.actionType : null;
}

function safestActionFor(input: {
  attentionType: CanonicalMerchantAttentionType;
  ceiling: CanonicalFeeActionability;
  strongestExistingAction: "request_removal" | "request_repricing" | null;
}): CanonicalMerchantAttentionSafeActionType {
  if (input.ceiling === "potentially_actionable" && input.strongestExistingAction) return input.strongestExistingAction;
  switch (input.attentionType) {
    case "pricing_review":
    case "potential_negotiation": return input.ceiling === "not_actionable" ? "monitor" : "request_pricing_review";
    case "explanation_or_itemization": return "request_itemization";
    case "compliance_or_remediation": return "verify_charge";
    case "configuration_or_payment_practice_review": return "review_configuration";
    case "service_use_review": return "check_service_use";
    case "monitor": return "monitor";
    case "informational": return "no_action";
  }
}

function actionInstruction(action: CanonicalMerchantAttentionSafeActionType, attentionType: CanonicalMerchantAttentionType): string {
  switch (action) {
    case "request_removal": return "Use the supporting documentation to request removal and ask for written confirmation of the change.";
    case "request_repricing": return "Use the supporting pricing evidence to request repricing and ask for the revised schedule in writing.";
    case "request_pricing_review": return "Ask the processor to review the account's current pricing and provide the current pricing schedule.";
    case "request_itemization": return "Ask the processor to identify the service or program behind the charge and provide an itemized explanation.";
    case "verify_charge": return attentionType === "compliance_or_remediation"
      ? "Ask what compliance condition triggered the charge and what documented steps will resolve it."
      : "Ask the processor to verify the charge and identify its contractual basis.";
    case "check_service_use": return "Confirm what service the fee covers, whether it is being used, and which pricing term applies.";
    case "review_configuration": return "Ask whether account configuration or transaction handling contributes to the charge and request the applicable documentation.";
    case "review_documentation": return "Compare the charge with the available account documentation before taking a stronger action.";
    case "request_explanation": return "Ask the processor for a written explanation of the charge.";
    case "monitor": return "Monitor another statement period and compare whether the charge or pricing pattern repeats.";
    case "no_action": return "Keep this charge as informational context unless separate evidence identifies a specific issue.";
  }
}

function actionToolkitFor(input: {
  itemId: string;
  actionType: CanonicalMerchantAttentionSafeActionType;
  attentionType: CanonicalMerchantAttentionType;
  evidenceRefs: string[];
  instruction: string;
  documentationNeeded: string[];
}): CanonicalMerchantAttentionActionToolkit {
  const exactAsk = exactAskFor(input.actionType, input.attentionType);
  return {
    moduleId: `toolkit_${input.itemId}`,
    attentionItemId: input.itemId,
    actionType: input.actionType,
    whatToDo: input.instruction,
    why: toolkitWhy(input.attentionType),
    statementEvidenceRefs: input.evidenceRefs,
    exactAsk,
    requestDocumentation: input.documentationNeeded,
    unclearAnswerFollowUp: exactAsk
      ? "If the answer is unclear, ask for the response in writing with the specific pricing term, service name, or program name identified."
      : null,
    avoidClaiming: [
      "Do not describe the observed amount as savings or an overcharge without separate admitted support.",
      "Do not claim a contract breach, guaranteed removal, or guaranteed repricing from this statement alone.",
    ],
    successCriteria: successCriteriaFor(input.actionType),
  };
}

function exactAskFor(action: CanonicalMerchantAttentionSafeActionType, attentionType: CanonicalMerchantAttentionType): string | null {
  if (action === "request_itemization") return "What service, program, or pricing term does this charge relate to, and can you provide an itemized description?";
  if (action === "verify_charge" && attentionType === "compliance_or_remediation") return "What compliance condition triggered this charge, what steps will resolve it, and how will completion be confirmed?";
  if (action === "check_service_use") return "What service does this fee cover, is it active on the account, and what pricing term authorizes it?";
  if (action === "review_configuration") return "Does account configuration or transaction handling contribute to this charge, and what documented change could affect it?";
  if (action === "request_pricing_review") return "Please review the account's current pricing and provide the current pricing schedule and an explanation of the processor-controlled components.";
  if (action === "request_removal") return "Please apply the supported removal term and confirm the effective date in writing.";
  if (action === "request_repricing") return "Please apply the supported pricing term and provide the revised schedule in writing.";
  if (action === "monitor") return "Which future statement line should be checked to confirm whether this charge or pattern repeats?";
  return null;
}

function toolkitWhy(type: CanonicalMerchantAttentionType): string {
  switch (type) {
    case "pricing_review":
    case "potential_negotiation": return "The accepted pricing and ownership context supports review, but the statement alone does not establish an overcharge.";
    case "explanation_or_itemization": return "The statement confirms a charge without enough detail to understand what it covers.";
    case "compliance_or_remediation": return "The explicit statement wording supports resolving the compliance condition without assuming the underlying cause.";
    case "configuration_or_payment_practice_review": return "The charge may depend on account settings or transaction handling that the statement does not fully explain.";
    case "service_use_review": return "The statement confirms the charge but not whether the associated service is needed or differently priced.";
    case "monitor": return "Another period can establish whether the pattern repeats before a stronger conclusion is made.";
    case "informational": return "The charge is useful context but does not currently support merchant action.";
  }
}

function successCriteriaFor(action: CanonicalMerchantAttentionSafeActionType): string[] {
  if (action === "request_removal") return ["Written confirmation identifies the removed charge and effective date."];
  if (action === "request_repricing") return ["A revised written pricing schedule identifies the new terms and effective date."];
  if (action === "monitor") return ["A later statement confirms whether the charge or pattern repeated."];
  if (action === "review_configuration") return ["The processor identifies the relevant setting or transaction practice and provides documented next steps."];
  return ["A written answer identifies the charge, applicable term, and any evidence-based next step."];
}

function questionFor(type: CanonicalMerchantAttentionType, label: string): string {
  if (type === "explanation_or_itemization") return `What does the statement charge labeled “${label}” cover?`;
  if (type === "compliance_or_remediation") return "What compliance condition triggered this charge, and what documented steps resolve it?";
  if (type === "service_use_review") return "What service does this charge cover, and is that service currently being used?";
  if (type === "configuration_or_payment_practice_review") return "Which pricing, configuration, or transaction condition contributed to this charge?";
  if (type === "pricing_review" || type === "potential_negotiation") return "How does this charge compare with the current merchant pricing agreement?";
  return "What additional evidence is needed to resolve this charge?";
}

function statementKnowledge(label: string, amount: MoneyAmount | null): string {
  if (!amount) return `The statement contains a charge labeled “${label},” but its amount is unavailable.`;
  return `The statement contains an observed charge labeled “${label}” for ${formatMoney(amount)}.`;
}

function eligibleFeeRow(row: CanonicalFeeRow): boolean {
  return row.selectedAmount !== null &&
    row.selectedAmount.amountMinor > 0 &&
    (row.contributesToUniqueTotal || row.role === "interchange_detail_row") &&
    !["credit", "duplicate_representation", "supporting_evidence_only"].includes(row.role);
}

function compareAttentionItems(left: CanonicalMerchantAttentionItem, right: CanonicalMerchantAttentionItem): number {
  const priorityOrder: Record<CanonicalMerchantAttentionPriority, number> = { high_priority: 0, review: 1, routine: 2 };
  const priority = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priority !== 0) return priority;
  const amount = Math.abs(right.observedAmount?.amountMinor ?? 0) - Math.abs(left.observedAmount?.amountMinor ?? 0);
  return amount !== 0 ? amount : left.id.localeCompare(right.id);
}

function lowerActionability(left: CanonicalFeeActionability, right: CanonicalFeeActionability): CanonicalFeeActionability {
  const order: CanonicalFeeActionability[] = ["not_actionable", "unknown", "verify_only", "potentially_actionable"];
  return order[Math.min(order.indexOf(left), order.indexOf(right))] ?? "unknown";
}

function lowerConfidence(
  left: CanonicalFeeClassificationConfidence,
  right: CanonicalFeeClassificationConfidence,
  cap: CanonicalFeeClassificationConfidence,
): CanonicalFeeClassificationConfidence {
  const order: CanonicalFeeClassificationConfidence[] = ["low", "medium", "high"];
  return order[Math.min(order.indexOf(left), order.indexOf(right), order.indexOf(cap))] ?? "low";
}

function strongerResolution(
  current: CanonicalMerchantAttentionResolutionRequirement | null,
  candidate: CanonicalMerchantAttentionResolutionRequirement,
): CanonicalMerchantAttentionResolutionRequirement {
  return !current || resolutionRank(candidate) > resolutionRank(current) ? candidate : current;
}

function resolutionRank(value: CanonicalMerchantAttentionResolutionRequirement): number {
  const order: CanonicalMerchantAttentionResolutionRequirement[] = [
    "no_additional_evidence_required",
    "public_documentation_required",
    "processor_explanation_required",
    "additional_statement_history_required",
    "merchant_pricing_agreement_required",
    "deterministic_math_required",
    "unresolved_review_required",
  ];
  return order.indexOf(value);
}

function cloneMoney(value: MoneyAmount | null): MoneyAmount | null {
  return value ? { amountMinor: value.amountMinor, currency: value.currency } : null;
}

function formatMoney(value: MoneyAmount): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: value.currency }).format(value.amountMinor / 100);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function validateCanonicalMerchantAttentionModel(
  analysis: Pick<CanonicalStatementAnalysis, "merchantAttention" | "feeLedger" | "feeOwnershipActionability" | "opportunityEngine" | "customerState" | "evidence" | "versionManifest">,
): string[] {
  const errors: string[] = [];
  const model = analysis.merchantAttention;
  if (!model || model.policyVersion !== MERCHANT_ATTENTION_POLICY_VERSION) return ["Package 2 merchant-attention model is missing or unsupported."];
  if (analysis.versionManifest?.merchantAttentionPolicyVersion !== MERCHANT_ATTENTION_POLICY_VERSION) errors.push("Package 2 merchant-attention manifest version is missing.");
  const feeRows = new Map(analysis.feeLedger.rows.map((row) => [row.id, row]));
  const classifications = new Map(analysis.feeOwnershipActionability.rowClassifications.map((row) => [row.feeRowId, row]));
  const evidenceIds = new Set(analysis.evidence.map((record) => record.id));
  const opportunityComponents = new Map(analysis.opportunityEngine.components.map((component) => [component.id, component]));
  const itemIds = new Set<string>();
  for (const item of model.items) {
    if (itemIds.has(item.id)) errors.push(`Package 2 duplicate attention item ${item.id}.`);
    itemIds.add(item.id);
    if (item.policyVersion !== MERCHANT_ATTENTION_POLICY_VERSION) errors.push(`Package 2 item ${item.id} has an unsupported policy version.`);
    for (const evidenceRef of item.evidenceRefs) if (!evidenceIds.has(evidenceRef)) errors.push(`Package 2 item ${item.id} has broken evidence ref ${evidenceRef}.`);
    if (item.scope === "fee_row") {
      if (item.feeRowIds.length !== 1) errors.push(`Package 2 fee item ${item.id} must identify exactly one canonical fee row.`);
      const row = feeRows.get(item.feeRowIds[0] ?? "");
      if (!row) errors.push(`Package 2 item ${item.id} has a broken fee-row reference.`);
      else {
        if (item.originalObservedStatementLabel !== row.selectedLabel || !sameMoney(item.observedAmount, row.selectedAmount)) {
          errors.push(`Package 2 item ${item.id} does not preserve the observed fee label and amount.`);
        }
        const classification = classifications.get(row.id);
        if (classification && actionabilityRank(item.actionabilityCeiling) > actionabilityRank(classification.selected.actionabilityCeiling)) {
          errors.push(`Package 2 item ${item.id} exceeds the accepted actionability ceiling.`);
        }
      }
    } else if (item.feeRowIds.length !== 0 || item.observedAmount !== null) {
      errors.push(`Package 2 statement-pricing item ${item.id} cannot masquerade as a fee amount.`);
    }
    if (item.opportunityLink) {
      if (item.opportunityLink.linkageOnly !== true || item.opportunityLink.moneyRecomputed !== false) errors.push(`Package 2 item ${item.id} has an invalid opportunity link.`);
      for (const componentRef of item.opportunityLink.componentRefs) {
        const component = opportunityComponents.get(componentRef);
        if (!component || component.inclusionStatus !== "included" || !["deterministic", "approved_estimate"].includes(component.eligibility)) {
          errors.push(`Package 2 item ${item.id} links an unsupported opportunity component ${componentRef}.`);
        }
      }
    }
    if (item.safestNextAction.actionType === "request_removal" || item.safestNextAction.actionType === "request_repricing") {
      const supported = analysis.customerState.actionGuidance.some((action) =>
        action.actionType === item.safestNextAction.actionType &&
        action.feeRowRefs.some((ref) => item.feeRowIds.includes(ref)) &&
        action.opportunityComponentRefs.some((ref) => item.opportunityLink?.componentRefs.includes(ref)),
      );
      if (item.actionabilityCeiling !== "potentially_actionable" || !supported) errors.push(`Package 2 item ${item.id} exposes a stronger action without canonical support.`);
    }
    if (item.questionToResolve) {
      if (item.questionToResolve.attentionItemId !== item.id || item.questionToResolve.amountIsSavings !== false || !sameMoney(item.questionToResolve.amountUnderReview, item.observedAmount)) {
        errors.push(`Package 2 question ${item.questionToResolve.questionId} is inconsistent with its attention item.`);
      }
    }
    if (item.actionToolkit?.attentionItemId !== item.id && item.actionToolkit !== null) errors.push(`Package 2 toolkit module for ${item.id} is detached.`);
    if (item.surfaceEligibility.questionsToResolve !== Boolean(item.questionToResolve)) errors.push(`Package 2 item ${item.id} has contradictory question projection eligibility.`);
    if (item.surfaceEligibility.actionToolkit !== Boolean(item.actionToolkit)) errors.push(`Package 2 item ${item.id} has contradictory toolkit projection eligibility.`);
    const expectedLanguageEligibility = languageEligibilityFor({
      scope: item.scope,
      priorityFinding: item.surfaceEligibility.priorityFinding,
      questionToResolve: item.questionToResolve !== null,
      actionToolkit: item.actionToolkit !== null,
      inventoryDisposition: item.inventoryDisposition,
      priority: item.priority,
      attentionType: item.attentionType,
    });
    if (JSON.stringify(item.merchantLanguageEligibility) !== JSON.stringify(expectedLanguageEligibility)) {
      errors.push(`Package 2 item ${item.id} has invalid merchant-language AI eligibility.`);
    }
    if (containsInternalMerchantLanguage(item)) errors.push(`Package 2 item ${item.id} exposes internal engineering language in merchant-safe fields.`);
  }
  const expectedOrder = model.items.slice().sort(compareAttentionItems).map((item) => item.id);
  if (JSON.stringify(expectedOrder) !== JSON.stringify(model.items.map((item) => item.id))) errors.push("Package 2 attention items are not deterministically ordered.");
  const expectedSummary = {
    itemCount: model.items.length,
    highPriorityCount: model.items.filter((item) => item.priority === "high_priority").length,
    reviewCount: model.items.filter((item) => item.priority === "review").length,
    routineCount: model.items.filter((item) => item.priority === "routine").length,
    questionCount: model.items.filter((item) => item.questionToResolve !== null).length,
    actionToolkitCount: model.items.filter((item) => item.actionToolkit !== null).length,
  };
  if (JSON.stringify(model.summary) !== JSON.stringify(expectedSummary)) errors.push("Package 2 attention summary does not reconstruct from items.");
  if (
    model.interpretation?.policyVersion !== "merchant_attention_ai_interpretation_v1" ||
    model.interpretation.normalPathRequirement !== "ai_interpretation_required" ||
    model.interpretation.authoritative !== false ||
    model.interpretation.financialMutationAllowed !== false
  ) {
    errors.push("Package 2 merchant-language interpretation boundary is missing or unsafe.");
  } else {
    const eligibleItems = model.items.filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation);
    const admittedItems = eligibleItems.filter((item) => item.merchantLanguageSource === "admitted_ai_interpretation");
    const routineFallbackItems = model.items.filter((item) => !item.merchantLanguageEligibility.eligibleForAiInterpretation);
    const expectedCoverage = {
      policyVersion: MERCHANT_ATTENTION_LANGUAGE_ELIGIBILITY_POLICY_VERSION,
      eligibleItemCount: eligibleItems.length,
      admittedItemCount: admittedItems.length,
      deterministicRoutineItemCount: routineFallbackItems.length,
      exactEligibleCoverage: model.interpretation.source === "admitted_ai_interpretation"
        && admittedItems.length === eligibleItems.length,
    };
    if (JSON.stringify(model.interpretation.coverage) !== JSON.stringify(expectedCoverage)) {
      errors.push("Package 2 merchant-language eligibility coverage does not reconstruct from items.");
    }
    if (routineFallbackItems.some((item) => item.merchantLanguageSource !== "deterministic_fallback")) {
      errors.push("Package 2 routine inventory language must remain deterministic fallback.");
    }
    if (model.interpretation.source === "deterministic_fallback" && admittedItems.length > 0) {
      errors.push("Package 2 degraded merchant language cannot contain admitted AI items.");
    }
    if (
      model.interpretation.source === "admitted_ai_interpretation" &&
      (model.interpretation.readiness !== "ready" ||
        !model.interpretation.outputRef ||
        !model.interpretation.coverage.exactEligibleCoverage ||
        !model.interpretation.admission.schemaValidated ||
        !model.interpretation.admission.canonicalLinkageValidated ||
        !model.interpretation.admission.actionabilityCeilingValidated ||
        !model.interpretation.admission.privacyValidated)
    ) {
      errors.push("Package 2 AI merchant interpretation is marked admitted without complete deterministic admission proof.");
    }
    if (model.interpretation.source === "deterministic_fallback" && model.interpretation.readiness !== "degraded_fallback") {
      errors.push("Package 2 deterministic merchant language is not marked as a degraded fallback.");
    }
  }
  if ((model.status === "empty") !== (model.items.length === 0)) errors.push("Package 2 empty status is inconsistent with item count.");
  const forbiddenPath = forbiddenFinancialFieldPath(model);
  if (forbiddenPath) errors.push(`Package 2 merchant-attention model contains forbidden reconstructed financial field ${forbiddenPath}.`);
  return errors;
}

function containsInternalMerchantLanguage(item: CanonicalMerchantAttentionItem): boolean {
  const merchantTexts = [
    item.merchantTitle,
    item.whyThisDeservesAttention,
    item.evidenceBoundary.reasonableConclusion.summary,
    ...item.evidenceBoundary.remainingUncertainty,
    item.resolution.merchantMeaning,
    item.safestNextAction.instruction,
    item.questionToResolve?.question ?? "",
    item.questionToResolve?.whatRateRevealKnows ?? "",
    item.questionToResolve?.whatRemainsUncertain ?? "",
    item.actionToolkit?.whatToDo ?? "",
    item.actionToolkit?.why ?? "",
    item.actionToolkit?.exactAsk ?? "",
  ];
  return merchantTexts.some((text) => /\bPackage\s+[A-Z0-9]|\bcanonical\b|\bprovider model\b|\bmodel inference\b|\bpolicy code\b/i.test(text));
}

function forbiddenFinancialFieldPath(value: unknown, path = "merchantAttention"): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const next = `${path}.${key}`;
    if (key === "amountIsSavings" && nested === false) continue;
    if (/savings|overpayment|recoverable|annualImpact|monthlyImpact|opportunityAmount|calculatedOpportunity/i.test(key)) return next;
    const found = forbiddenFinancialFieldPath(nested, next);
    if (found) return found;
  }
  return null;
}

function sameMoney(left: MoneyAmount | null, right: MoneyAmount | null): boolean {
  return left === null || right === null
    ? left === right
    : left.amountMinor === right.amountMinor && left.currency === right.currency;
}

function actionabilityRank(value: CanonicalFeeActionability): number {
  return ({ not_actionable: 0, unknown: 1, verify_only: 2, potentially_actionable: 3 })[value];
}
