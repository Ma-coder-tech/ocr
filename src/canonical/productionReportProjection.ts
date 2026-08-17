import {
  validateProductionReportProjection,
  validateProductionReportProjectionAgainstCanonical,
} from "./productionReportProjectionValidation.js";
import {
  PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION,
  type ProductionMerchantLanguageSource,
  type ProductionReportProjection,
  type ProductionReportablePayload,
} from "./productionReportProjectionTypes.js";
import type {
  CanonicalCustomerPermissionKey,
  CanonicalFeeCategory,
  CanonicalFeeRow,
  CanonicalMerchantAttentionItem,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "./types.js";

const USD = "USD" as const;

export function buildProductionReportProjection(analysis: CanonicalStatementAnalysis): ProductionReportProjection {
  const visibility = visibilityCeiling(analysis);
  const header = {
    title: "Your RateReveal statement review" as const,
    merchantName: selectedCustomerIdentity(analysis.identity.merchantName),
    processor: selectedString(analysis.identity.processorName),
    statementPeriod: analysis.identity.statementPeriod.status === "selected" ? analysis.identity.statementPeriod.value : null,
    statementScope: "One statement analyzed." as const,
  };
  if (!reportable(analysis, visibility)) {
    return assertValid(analysis, {
      schemaVersion: PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION,
      experience: "unable_to_complete",
      header,
      recovery: recoveryFor(analysis),
      report: null,
    });
  }

  const questions = projectQuestions(analysis, visibility);
  const questionContext = openQuestionContext(analysis, visibility);
  const experience = resolveReportableExperience(analysis, visibility);
  const languageSource: ProductionMerchantLanguageSource = analysis.merchantAttention.interpretation.source === "admitted_ai_interpretation"
    ? "ai_assisted"
    : "deterministic_fallback";
  const report: ProductionReportablePayload = {
    merchantLanguage: { source: languageSource, degraded: languageSource === "deterministic_fallback" },
    hero: hero(analysis, visibility),
    snapshot: snapshot(analysis, visibility),
    trustStrip: trustStrip(analysis, visibility),
    composition: composition(analysis, visibility),
    priorityFindings: findings(analysis, languageSource, visibility),
    openQuestions: {
      heading: "What still needs checking",
      status: questions.length || questionContext.length ? "shown" : "omitted",
      context: questionContext,
      items: questions,
    },
    allCharges: allCharges(analysis, visibility),
    nextActions: nextActions(analysis, visibility),
    monitoring: cleanMonitoring(analysis, visibility, experience),
    methodology: {
      heading: "How RateReveal reviewed this statement",
      disclosures: visibility.customerExplanation ? [
        ...(visibility.effectiveRate ? ["RateReveal calculates the effective rate from the processed sales and total fees supported by this statement."] : []),
        "Charge explanations are limited to what the statement and accepted reference material support. Uncertain items stay marked for checking.",
        "Reference ranges provide context only. They do not create a savings or overpayment amount.",
      ] : [],
    },
    saveReport: {
      status: "planned_unavailable",
      capabilities: [
        { id: "download_pdf", label: "Download PDF", implemented: false, availability: "planned" },
        { id: "email_copy", label: "Email me a copy", implemented: false, availability: "planned" },
      ],
    },
    continuation: {
      status: "planned_unavailable",
      title: "See what one month can't show",
      body: "Comparing several statements can reveal recurring charges, pricing changes, and patterns that one month alone cannot establish.",
      benefits: ["Track recurring charges", "See pricing changes over time", "Separate one-time items from persistent patterns"],
      qualification: "More history can improve context, but it does not guarantee a lower rate or a recoverable amount.",
      callToAction: { label: "Compare 3–6 more months", implemented: false },
    },
  };
  return assertValid(analysis, { schemaVersion: PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION, experience, header, recovery: null, report });
}

type VisibilityCeiling = {
  coreMetrics: boolean;
  effectiveRate: boolean;
  benchmark: boolean;
  feeInventory: boolean;
  ownershipActionability: boolean;
  evidenceCalculations: boolean;
  opportunityLinkage: boolean;
  verificationAmounts: boolean;
  actions: boolean;
  customerExplanation: boolean;
};

function visibilityCeiling(analysis: CanonicalStatementAnalysis): VisibilityCeiling {
  const visible = analysis.customerState.visibility;
  return {
    coreMetrics: visible.showCoreMetrics && permissionPermitted(analysis, "core_metrics"),
    effectiveRate: visible.showEffectiveRate && permissionPermitted(analysis, "effective_rate"),
    benchmark: visible.showBenchmark && permissionPermitted(analysis, "benchmark"),
    feeInventory: visible.showFeeInventory && permissionPermitted(analysis, "fee_inventory"),
    ownershipActionability: visible.showOwnershipActionability && permissionPermitted(analysis, "ownership_actionability"),
    evidenceCalculations: visible.showEvidenceCalculations && permissionPermitted(analysis, "evidence_calculations"),
    opportunityLinkage: (visible.showDeterministicOpportunity && permissionPermitted(analysis, "deterministic_opportunity"))
      || (visible.showEstimatedOpportunity && permissionPermitted(analysis, "estimated_opportunity")),
    verificationAmounts: visible.showVerificationAmounts && permissionPermitted(analysis, "verification_amounts"),
    actions: visible.showActions
      && permissionPermitted(analysis, "actions")
      && visible.showFeeInventory
      && permissionPermitted(analysis, "fee_inventory")
      && visible.showOwnershipActionability
      && permissionPermitted(analysis, "ownership_actionability"),
    customerExplanation: visible.showCustomerExplanation && permissionPermitted(analysis, "customer_explanation"),
  };
}

function reportable(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): boolean {
  const { analysisReadiness, dataIntegrity } = analysis.customerState.axes;
  const withheld = analysis.customerState.primaryState === "unable_to_analyze"
    || analysis.customerState.primaryState === "analysis_withheld"
    || analysisReadiness === "unavailable"
    || analysisReadiness === "withheld";
  const coreSafe = !visibility.coreMetrics || (
    analysis.financialFacts.processedSales.status === "selected"
    && (analysis.financialFacts.processedSales.value?.amountMinor ?? 0) > 0
    && analysis.financialFacts.totalFees.status === "selected"
    && analysis.financialFacts.totalFees.value !== null
  );
  const rateSafe = !visibility.effectiveRate || (
    analysis.financialFacts.rateRevealCalculatedAllInRate.status === "selected"
    && analysis.financialFacts.rateRevealCalculatedAllInRate.value !== null
  );
  return analysis.validation.status !== "invalid"
    && !withheld
    && dataIntegrity !== "failed"
    && dataIntegrity !== "unavailable"
    && (visibility.coreMetrics || visibility.effectiveRate)
    && coreSafe
    && rateSafe
    && analysis.identity.statementPeriod.status === "selected"
    && analysis.identity.statementPeriod.value !== null;
}

function hero(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): ProductionReportablePayload["hero"] {
  if (!visibility.effectiveRate) return {
    status: "omitted",
    heading: "Your effective rate",
    effectiveRate: null,
    benchmark: null,
    benchmarkUnavailableMessage: null,
    interpretation: null,
    primaryNextAction: null,
  };
  const comparison = analysis.customerState.rateComparison;
  const benchmark = visibility.benchmark && comparison.status === "qualified" && comparison.benchmarkRef?.range && qualifiedRange(comparison.benchmarkRef.range)
    ? {
        label: comparison.benchmarkRef.displayLabel ?? "RateReveal reference range",
        range: { ...comparison.benchmarkRef.range },
        position: comparison.position as "below_reference" | "within_reference" | "above_reference",
        context: {
          referenceSegment: businessSegmentLabel(
            analysis.businessQualification.resolvedSegmentId
              ?? comparison.benchmarkRef.segmentId
              ?? comparison.benchmarkRef.applicableBusinessType,
          ),
          risk: riskLabel(analysis.businessQualification.risk.value !== "unknown"
            ? analysis.businessQualification.risk.value
            : comparison.benchmarkRef.riskClass ?? null),
          processingChannel: channelLabel(analysis.businessQualification.channel.value !== "unknown"
            ? analysis.businessQualification.channel.value
            : comparison.benchmarkRef.channel ?? comparison.benchmarkRef.applicableChannel),
          annualVolume: volumeLabel(analysis.businessQualification.annualVolume.tier !== "unknown"
            ? analysis.businessQualification.annualVolume.tier
            : comparison.benchmarkRef.annualVolumeTier ?? null),
          market: analysis.businessQualification.market.value === "US" || comparison.benchmarkRef.market === "US"
            ? "United States"
            : null,
          processor: processorLabel(comparison.benchmarkRef.applicableProcessor),
          confidence: comparison.benchmarkRef.confidence ?? analysis.businessQualification.confidence,
        },
        limitations: [...comparison.benchmarkRef.limitations],
      }
    : null;
  const position = benchmark ? comparison.position : "unavailable";
  return {
    status: "shown",
    heading: "Your effective rate",
    effectiveRate: analysis.financialFacts.rateRevealCalculatedAllInRate.value!,
    benchmark,
    benchmarkUnavailableMessage: benchmark ? null : "A qualified reference range is not available for this statement. Your statement results are still available.",
    interpretation: !visibility.customerExplanation ? null : position === "above_reference"
      ? "Your effective rate is above the qualified reference range. Review the specific charges below before drawing a conclusion."
      : position === "within_reference"
        ? "Your effective rate is within the qualified reference range. Individual charges may still deserve attention."
        : position === "below_reference"
          ? "Your effective rate is below the qualified reference range. Continue to review changes over time."
          : "This statement shows your effective rate, but there is not enough qualified context for a rate comparison.",
    primaryNextAction: !visibility.actions ? null : analysis.merchantAttention.items.some((item) => item.surfaceEligibility.actionToolkit)
      ? "Start with the highest-priority charge and ask the specific question shown below."
      : "Keep this report and compare future statements for changes.",
  };
}

function snapshot(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): ProductionReportablePayload["snapshot"] {
  if (!visibility.coreMetrics) return { status: "omitted", heading: "Statement snapshot", processedSales: null, totalFees: null };
  const count = transactionCount(analysis);
  return {
    status: "shown",
    heading: "Statement snapshot",
    processedSales: analysis.financialFacts.processedSales.value!,
    totalFees: analysis.financialFacts.totalFees.value!,
    ...(count ? { transactionCount: count } : {}),
  };
}

function qualifiedRange(range: { low: string; high: string }): boolean {
  const low = Number(range.low);
  const high = Number(range.high);
  return Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high >= low;
}

function transactionCount(analysis: CanonicalStatementAnalysis): NonNullable<ProductionReportablePayload["snapshot"]["transactionCount"]> | null {
  const counts = analysis.financialFacts.transactionCounts;
  const options = [
    ["submitted_transactions", counts.submittedTransactions],
    ["settled_transactions", counts.settledTransactions],
    ["authorizations", counts.authorizations],
  ] as const;
  for (const [basis, fact] of options) if (fact.status === "selected" && typeof fact.value === "number" && fact.value >= 0) return { value: fact.value, basis };
  return null;
}

function trustStrip(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): ProductionReportablePayload["trustStrip"] {
  const items: ProductionReportablePayload["trustStrip"]["items"] = [];
  if (visibility.coreMetrics) {
    items.push(
      { label: "Processed sales verified", status: analysis.financialFacts.processedSales.status === "selected" ? "confirmed" : "needs_checking" },
      { label: "Processing fees verified", status: analysis.financialFacts.totalFees.status === "selected" ? "confirmed" : "needs_checking" },
    );
  }
  if (visibility.evidenceCalculations) {
    items.push({
      label: "Charge and fee reconciliation",
      status: analysis.customerState.axes.dataIntegrity === "reconciled" ? "confirmed" : "limited",
    });
  }
  items.push({ label: "One-statement scope", status: "confirmed" });
  return {
    status: items.length ? "shown" : "omitted",
    items,
  };
}

function composition(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): ProductionReportablePayload["composition"] {
  if (!visibility.coreMetrics || !visibility.feeInventory || !visibility.ownershipActionability || !visibility.evidenceCalculations) return {
    heading: "Where your fees went",
    status: "omitted",
    categories: [],
    representedTotal: null,
    statementFeeTotal: null,
    difference: null,
    reconciled: null,
    disclosure: null,
    accessibleSummary: "A fee breakdown is not available in this report.",
  };
  const classification = new Map(analysis.feeOwnershipActionability.rowClassifications.map((row) => [row.feeRowId, row.selected.category]));
  const buckets = new Map<string, { label: string; amountMinor: number; rowCount: number }>();
  for (const row of safeChargeRows(analysis)) {
    const category = classification.get(row.id) ?? "unknown_needs_review";
    const group = compositionGroup(category);
    const existing = buckets.get(group.id) ?? { label: group.label, amountMinor: 0, rowCount: 0 };
    existing.amountMinor += contributionAmount(row).amountMinor;
    existing.rowCount += 1;
    buckets.set(group.id, existing);
  }
  const categories = [...buckets.entries()].filter(([, value]) => value.amountMinor !== 0).map(([id, value]) => ({
    id, label: value.label, amount: money(value.amountMinor), rowCount: value.rowCount,
  })).sort((left, right) => right.amount.amountMinor - left.amount.amountMinor || left.id.localeCompare(right.id));
  const representedMinor = categories.reduce((sum, category) => sum + category.amount.amountMinor, 0);
  const feeMinor = analysis.financialFacts.totalFees.value!.amountMinor;
  const differenceMinor = feeMinor - representedMinor;
  const reconciled = differenceMinor === 0;
  const partial = analysis.feeLedger.status !== "available" || !reconciled || analysis.feeLedger.controls.some((control) => !["pass", "pass_with_rounding"].includes(control.status));
  if (categories.length === 0) return {
    heading: "Where your fees went",
    status: "omitted",
    categories: [],
    representedTotal: null,
    statementFeeTotal: null,
    difference: null,
    reconciled: null,
    disclosure: null,
    accessibleSummary: "No safe charge breakdown is available.",
  };
  return {
    heading: "Where your fees went",
    status: partial ? "partial" : "shown",
    categories,
    representedTotal: money(representedMinor),
    statementFeeTotal: money(feeMinor),
    difference: money(differenceMinor),
    reconciled,
    disclosure: partial ? "The visible charge rows do not fully account for the statement fee total, so this breakdown is partial." : null,
    accessibleSummary: categories.map((category) => `${category.label}: ${formatMoney(category.amount)}`).join("; "),
  };
}

function findings(
  analysis: CanonicalStatementAnalysis,
  languageSource: ProductionMerchantLanguageSource,
  visibility: VisibilityCeiling,
): ProductionReportablePayload["priorityFindings"] {
  if (!visibility.feeInventory || !visibility.ownershipActionability || !visibility.customerExplanation) {
    return { heading: "What deserves attention", status: "omitted", items: [] };
  }
  const items = analysis.merchantAttention.items.filter((item) => item.surfaceEligibility.priorityFinding).map((item) => ({
    id: item.id,
    attentionType: merchantAttentionType(item.attentionType),
    priority: item.priority,
    merchantTitle: customerCopy(item.merchantTitle),
    observedLabel: item.originalObservedStatementLabel ? customerCopy(item.originalObservedStatementLabel) : null,
    observedAmount: item.observedAmount,
    category: categoryLabel(item.category),
    likelyOwner: item.likelyOwner ? {
      economicBeneficiary: partyLabel(item.likelyOwner.economicBeneficiary),
      contractualController: partyLabel(item.likelyOwner.contractualController),
    } : null,
    evidenceStatus: evidenceStatusLabel(item.evidenceStatus),
    confidence: item.confidence,
    whyDeservesAttention: customerCopy(item.whyThisDeservesAttention),
    whatStatementShows: customerCopy(item.originalObservedStatementLabel ? `${item.originalObservedStatementLabel} appears on this statement.` : item.whyThisDeservesAttention),
    whatThisLikelyMeans: customerCopy(item.evidenceBoundary.reasonableConclusion.summary),
    whatStillNeedsConfirmation: item.evidenceBoundary.remainingUncertainty.map(customerCopy),
    safestNextAction: visibility.actions ? {
      actionType: merchantActionType(item.safestNextAction.actionType),
      instruction: customerCopy(item.safestNextAction.instruction),
    } : null,
    references: {
      evidenceRefs: visibility.evidenceCalculations ? [...new Set([...item.evidenceRefs, ...item.evidenceBoundary.statementProof.evidenceRefs])] : [],
      feeRowRefs: visibility.evidenceCalculations ? [...item.feeRowIds] : [],
    },
    opportunityLinkage: visibility.opportunityLinkage && item.opportunityLink ? {
      componentRefs: [...item.opportunityLink.componentRefs],
      linkageOnly: true as const,
      moneyIncluded: false as const,
    } : null,
    languageSource: item.merchantLanguageSource === "admitted_ai_interpretation" ? "ai_assisted" as const : languageSource === "ai_assisted" ? "deterministic_fallback" as const : languageSource,
  }));
  return { heading: "What deserves attention", status: items.length ? "shown" : "omitted", items };
}

function projectQuestions(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): ProductionReportablePayload["openQuestions"]["items"] {
  const questions: ProductionReportablePayload["openQuestions"]["items"] = visibility.feeInventory && visibility.ownershipActionability && visibility.customerExplanation
    ? analysis.merchantAttention.items.flatMap((item) => item.questionToResolve ? [{
    id: item.questionToResolve.questionId,
    question: customerCopy(item.questionToResolve.question),
    whatRateRevealKnows: customerCopy(item.questionToResolve.whatRateRevealKnows),
    whatRemainsUncertain: customerCopy(item.questionToResolve.whatRemainsUncertain),
    safeNextStep: customerCopy(item.questionToResolve.safeNextStep),
    requirement: item.questionToResolve.requirement,
    requiredEvidenceOrConfirmation: item.questionToResolve.requiredEvidenceOrConfirmation.map(customerCopy),
    references: {
      evidenceRefs: visibility.evidenceCalculations ? [...item.questionToResolve.evidenceRefs] : [],
      feeRowRefs: visibility.evidenceCalculations ? [...item.feeRowIds] : [],
    },
    amountUnderReview: visibility.verificationAmounts ? item.questionToResolve.amountUnderReview : null,
    amountIsSavings: false as const,
  }] : [])
    : [];
  const confirmation = analysis.businessQualification.confirmationRequirement;
  if (confirmation && visibility.customerExplanation) questions.push({
    id: "business_qualification_confirmation",
    question: customerCopy(confirmation.prompt),
    whatRateRevealKnows: "RateReveal kept your business declaration separate from the account coding shown by the processor.",
    whatRemainsUncertain: "The business type, processing channel, or risk profile still needs confirmation before a qualified comparison can be used.",
    safeNextStep: "Confirm the requested business details in RateReveal.",
    requirement: "merchant_confirmation_required",
    requiredEvidenceOrConfirmation: ["Merchant confirmation of the requested business or processing details."],
    references: {
      evidenceRefs: visibility.evidenceCalculations ? [...analysis.businessQualification.evidenceRefs] : [],
      feeRowRefs: [],
    },
    amountUnderReview: null,
    amountIsSavings: false,
  });
  return questions;
}

function allCharges(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): ProductionReportablePayload["allCharges"] {
  if (!visibility.feeInventory) return {
    heading: "All charges on this statement",
    status: "omitted",
    defaultView: null,
    completeness: "partial",
    disclosure: null,
    rows: [],
  };
  const attentionByRow = new Map<string, CanonicalMerchantAttentionItem>();
  for (const item of analysis.merchantAttention.items) for (const rowId of item.feeRowIds) attentionByRow.set(rowId, item);
  const classification = new Map(analysis.feeOwnershipActionability.rowClassifications.map((row) => [row.feeRowId, row.selected]));
  const rows = inventoryRows(analysis).map((row) => {
    const attention = attentionByRow.get(row.id);
    const selected = classification.get(row.id);
    const disposition = !visibility.ownershipActionability ? "informational" as const
      : attention?.inventoryDisposition === "unresolved_review" ? "unresolved" as const
      : attention?.surfaceEligibility.priorityFinding ? "attention" as const
      : attention?.inventoryDisposition === "routine_context" ? "routine" as const
      : "informational" as const;
    return {
      id: row.id,
      label: customerCopy(row.selectedLabel),
      amount: contributionAmount(row),
      category: visibility.ownershipActionability ? categoryLabel(selected?.category ?? "unknown_needs_review") : "unclassified",
      likelyOwner: visibility.ownershipActionability && selected ? {
        economicBeneficiary: partyLabel(selected.ownership.economicBeneficiary),
        contractualController: partyLabel(selected.ownership.contractualController),
      } : null,
      whatRateRevealKnows: !visibility.customerExplanation ? null : attention
        ? customerCopy(attention.evidenceBoundary.reasonableConclusion.summary)
        : "This charge is shown on the statement; no stronger conclusion is presented here.",
      evidenceStatus: evidenceStatusLabel(attention?.evidenceStatus ?? "statement_confirmed"),
      disposition,
      safestAction: visibility.actions && attention ? {
        actionType: merchantActionType(attention.safestNextAction.actionType),
        instruction: customerCopy(attention.safestNextAction.instruction),
      } : null,
      references: {
        evidenceRefs: visibility.evidenceCalculations ? [...row.contributionDecision.evidenceRefs] : [],
        feeRowRef: row.id,
      },
    };
  });
  const partial = analysis.feeLedger.status !== "available" || (rows.length === 0 && analysis.financialFacts.totalFees.value!.amountMinor > 0);
  return {
    heading: "All charges on this statement",
    status: partial ? "partial" : "shown",
    defaultView: rows.some((row) => row.disposition === "attention" || row.disposition === "unresolved") ? "attention" : "all",
    completeness: partial ? "partial" : "complete",
    disclosure: partial ? "Some statement charges could not be safely represented as individual rows." : null,
    rows,
  };
}

function nextActions(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): ProductionReportablePayload["nextActions"] {
  if (!visibility.actions || !visibility.ownershipActionability) {
    return { heading: "What to do next", status: "omitted", modules: [], guidance: null };
  }
  const modules = analysis.merchantAttention.items.filter((item) => item.surfaceEligibility.actionToolkit && item.actionToolkit).map((item) => ({
    id: item.actionToolkit!.moduleId,
    actionType: merchantActionType(item.actionToolkit!.actionType),
    title: item.actionToolkit!.actionType === "request_itemization" ? "Ask for a breakdown" : customerCopy(item.actionToolkit!.whatToDo),
    whatToDo: customerCopy(item.actionToolkit!.whatToDo),
    why: customerCopy(item.actionToolkit!.why),
    statementEvidenceRefs: visibility.evidenceCalculations ? [...item.actionToolkit!.statementEvidenceRefs] : [],
    exactAsk: item.actionToolkit!.exactAsk ? customerCopy(item.actionToolkit!.exactAsk) : null,
    requestDocumentation: item.actionToolkit!.requestDocumentation.map(customerCopy),
    followUp: item.actionToolkit!.unclearAnswerFollowUp ? customerCopy(item.actionToolkit!.unclearAnswerFollowUp) : null,
    avoidClaiming: item.actionToolkit!.avoidClaiming.map(customerCopy),
    successCriteria: item.actionToolkit!.successCriteria.map(customerCopy),
  }));
  if (modules.length) return { heading: "What to do next", status: "shown", modules, guidance: null };
  return { heading: "What to do next", status: "omitted", modules: [], guidance: null };
}

function cleanMonitoring(
  analysis: CanonicalStatementAnalysis,
  visibility: VisibilityCeiling,
  experience: ProductionReportProjection["experience"],
): ProductionReportablePayload["monitoring"] {
  const specificActionExists = analysis.merchantAttention.items.some((item) => item.surfaceEligibility.actionToolkit && item.actionToolkit);
  const priorityFindingExists = analysis.merchantAttention.items.some((item) => item.surfaceEligibility.priorityFinding);
  if (!visibility.customerExplanation || experience !== "analysis_completed" || specificActionExists || priorityFindingExists) {
    return { heading: "What to watch next", status: "omitted", guidance: [] };
  }
  return {
    heading: "What to watch next",
    status: "shown",
    guidance: [
      "Keep this statement as a baseline.",
      "Compare your effective rate and recurring charges on the next statement.",
      "Watch for new charges or changes to recurring charges.",
    ],
  };
}

function openQuestionContext(analysis: CanonicalStatementAnalysis, visibility: VisibilityCeiling): string[] {
  if (!visibility.customerExplanation) return [];
  const context: string[] = [];
  const { analysisReadiness, dataIntegrity } = analysis.customerState.axes;
  if (analysisReadiness === "limited" || analysis.customerState.primaryState === "analysis_limited") {
    context.push("Some parts of this statement review remain limited and need follow-up before the review can be considered complete.");
  }
  if (dataIntegrity === "partially_reconciled") {
    context.push("The available charge rows do not fully reconcile to the statement totals.");
  }
  if (analysis.customerState.primaryState === "verification_needed") {
    context.push("At least one statement-supported item still requires verification.");
  }
  if (analysis.businessQualification.status === "confirmation_required" || analysis.businessQualification.confirmationRequirement) {
    context.push("Business or processing details still need confirmation before all available context can be used.");
  }
  if (visibility.feeInventory && visibility.ownershipActionability && materialCoverageUnresolved(analysis)) {
    context.push("At least one material charge or coverage item remains unresolved.");
  }
  if (!visibility.coreMetrics || !visibility.effectiveRate) {
    context.push("Some financial fields are not available for customer display in this review.");
  }
  if (hasMaterialCanonicalLimitation(analysis)) {
    context.push("The statement review includes a material limitation that requires follow-up.");
  }
  return [...new Set(context)];
}

function resolveReportableExperience(
  analysis: CanonicalStatementAnalysis,
  visibility: VisibilityCeiling,
): Extract<ProductionReportProjection["experience"], "analysis_available_with_open_questions" | "analysis_completed"> {
  const { analysisReadiness, dataIntegrity } = analysis.customerState.axes;
  const hasOpenRequirement = analysisReadiness === "limited"
    || dataIntegrity === "partially_reconciled"
    || analysis.customerState.primaryState === "analysis_limited"
    || analysis.customerState.primaryState === "verification_needed"
    || analysis.businessQualification.status === "confirmation_required"
    || analysis.businessQualification.confirmationRequirement !== null
    || analysis.merchantAttention.items.some((item) => item.questionToResolve !== null)
    || materialCoverageUnresolved(analysis)
    || !visibility.coreMetrics
    || !visibility.effectiveRate
    || hasMaterialCanonicalLimitation(analysis);
  return hasOpenRequirement ? "analysis_available_with_open_questions" : "analysis_completed";
}

function hasMaterialCanonicalLimitation(analysis: CanonicalStatementAnalysis): boolean {
  return [...analysis.customerState.reasonCodes, ...analysis.customerState.limitations]
    .some((code) => /(?:verification|confirmation|reconciliation|coverage)_(?:required|incomplete)|analysis_limited/.test(code)
      && !/(?:benchmark|provider|narrative|explanation)/.test(code));
}

function materialCoverageUnresolved(analysis: CanonicalStatementAnalysis): boolean {
  return analysis.feeLedger.status !== "available"
    || analysis.feeLedger.controls.some((control) => !["pass", "pass_with_rounding"].includes(control.status))
    || analysis.feeLedger.rows.some((row) => row.role === "unknown_unresolved")
    || analysis.feeOwnershipActionability.rowClassifications.some((row) => row.selected.category === "unknown_needs_review");
}

function recoveryFor(analysis: CanonicalStatementAnalysis): NonNullable<ProductionReportProjection["recovery"]> {
  const signals = [
    ...analysis.validation.errors,
    ...analysis.validation.warnings,
    ...analysis.customerState.reasonCodes,
    ...analysis.customerState.limitations,
    ...analysis.customerState.visibility.hiddenReasonCodes,
  ].join(" ").toLowerCase();
  if (analysis.customerState.primaryState === "analysis_withheld" || analysis.customerState.axes.analysisReadiness === "withheld") {
    return {
      title: "We couldn't complete this statement review",
      reasonCode: "analysis_withheld",
      explanation: "RateReveal could not safely present financial conclusions from this review.",
      nextSteps: ["Review the statement details and resolve any verification request before trying again."],
    };
  }
  if (
    analysis.customerState.axes.dataIntegrity === "failed"
    || [analysis.financialFacts.processedSales, analysis.financialFacts.totalFees].some((fact) => fact.status === "ambiguous")
    || /conflict|inconsistent|unsafe total|reconciliation failed/.test(signals)
  ) {
    return {
      title: "We couldn't complete this statement review",
      reasonCode: "unsafe_or_conflicting_totals",
      explanation: "The statement totals could not be reconciled safely enough to present financial results.",
      nextSteps: ["Check that sales and fee totals are readable and internally consistent.", "If available, upload a clearer copy of the same statement."],
    };
  }
  if (
    [analysis.identity.statementPeriod, analysis.financialFacts.processedSales, analysis.financialFacts.totalFees].some((fact) => fact.status === "unsupported")
    || /unsupported|unreadable|cannot read|ocr|extraction failed|parse failed/.test(signals)
  ) {
    return {
      title: "We couldn't complete this statement review",
      reasonCode: "unreadable_or_unsupported_input",
      explanation: "RateReveal could not safely read this input as a supported processor statement.",
      nextSteps: ["Upload a clear, text-readable statement from a supported processor.", "Avoid screenshots or cropped pages when a full statement file is available."],
    };
  }
  if (analysis.identity.statementPeriod.status !== "selected" || /incomplete statement|missing page|cropped/.test(signals)) {
    return {
      title: "We couldn't complete this statement review",
      reasonCode: "missing_or_incomplete_statement",
      explanation: "The statement period or required statement coverage could not be verified.",
      nextSteps: ["Upload the full statement, including every page and the statement-period summary."],
    };
  }
  if (
    analysis.financialFacts.processedSales.status !== "selected"
    || analysis.financialFacts.totalFees.status !== "selected"
    || analysis.financialFacts.rateRevealCalculatedAllInRate.status !== "selected"
  ) {
    return {
      title: "We couldn't complete this statement review",
      reasonCode: "missing_required_financial_facts",
      explanation: "Required sales, fee, or effective-rate inputs could not be verified from this statement.",
      nextSteps: ["Confirm that the statement includes its processed-sales and total-fees summaries.", "Upload a clearer copy if those totals are present but unreadable."],
    };
  }
  return {
    title: "We couldn't complete this statement review",
    reasonCode: "review_could_not_be_completed",
    explanation: "RateReveal could not safely complete this statement review.",
    nextSteps: ["Review the uploaded file and try again with a clear supported processor statement."],
  };
}

function safeChargeRows(analysis: CanonicalStatementAnalysis): CanonicalFeeRow[] {
  return analysis.feeLedger.rows.filter((row) => row.contributesToUniqueTotal && row.contributionDecision.contributes && contributionAmount(row).amountMinor !== 0);
}

function inventoryRows(analysis: CanonicalStatementAnalysis): CanonicalFeeRow[] {
  return analysis.feeLedger.rows.filter((row) =>
    ["individual_charge", "interchange_detail_row", "adjustment", "credit", "unknown_unresolved"].includes(row.role)
    && (row.selectedAmount ?? row.signedAmount) !== null
    && contributionAmount(row).amountMinor !== 0,
  );
}

function contributionAmount(row: CanonicalFeeRow): MoneyAmount {
  if (row.contributionDecision.signedAmountBasis === "printed_signed_amount" && row.signedAmount) return row.signedAmount;
  return row.selectedAmount ?? row.signedAmount ?? money(0);
}

function compositionGroup(category: CanonicalFeeCategory): { id: string; label: string } {
  if (category === "interchange") return { id: "interchange", label: "Interchange" };
  if (["card_brand_network_assessment", "network_access_or_authorization"].includes(category)) return { id: "network", label: "Network fees" };
  if (["processor_markup", "processor_per_item_fee", "administrative_fee"].includes(category)) return { id: "processor", label: "Processor markup" };
  if (["service_fee", "compliance_fee", "equipment_or_lease", "third_party_product"].includes(category)) return { id: "services", label: "Services" };
  if (category === "unknown_needs_review") return { id: "unresolved", label: "Unresolved" };
  return { id: "other", label: "Other" };
}

function businessSegmentLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const labels: Record<string, string> = {
    restaurant_food_service: "Restaurant / Food Service",
    grocery_supermarket_specialty_food: "Grocery / Supermarket / Specialty Food",
  };
  return labels[value] ?? displayEnum(value);
}

function riskLabel(value: string | null | undefined): string | null {
  if (!value || value === "unknown") return null;
  return value === "standard" ? "Standard risk" : value === "high_risk" ? "Higher-risk category" : displayEnum(value);
}

function channelLabel(value: string | null | undefined): string | null {
  if (!value || value === "unknown") return null;
  const labels: Record<string, string> = {
    card_present: "Card present",
    card_not_present: "Card not present",
    mixed: "Mixed channels",
  };
  return labels[value] ?? displayEnum(value);
}

function volumeLabel(value: string | null | undefined): string | null {
  if (!value || value === "unknown") return null;
  const labels: Record<string, string> = {
    under_100k: "Under $100,000 annually",
    "100k_500k": "$100,000–$500,000 annually",
    "500k_2m": "$500,000–$2 million annually",
    "2m_10m": "$2–$10 million annually",
    over_10m: "Over $10 million annually",
  };
  return labels[value] ?? displayEnum(value);
}

function processorLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase() === "fiserv" ? "Fiserv" : displayEnum(value);
}

function categoryLabel(value: string): string {
  const labels: Record<string, string> = {
    statement_pricing: "Overall statement pricing",
    interchange: "Interchange",
    card_brand_network_assessment: "Card-brand network assessment",
    network_access_or_authorization: "Network access or authorization",
    processor_markup: "Processor markup",
    processor_per_item_fee: "Processor per-item fee",
    administrative_fee: "Administrative fee",
    service_fee: "Service fee",
    compliance_fee: "Compliance fee",
    equipment_or_lease: "Equipment or lease",
    third_party_product: "Third-party product",
    chargeback_or_dispute: "Chargeback or dispute",
    funding_adjustment: "Funding adjustment",
    tax_or_government: "Tax or government charge",
    credit: "Credit",
    unknown_needs_review: "Needs review",
  };
  return labels[value] ?? displayEnum(value);
}

function partyLabel(value: string): string {
  const labels: Record<string, string> = {
    network: "Card network",
    card_brand: "Card brand",
    issuer_or_interchange: "Card issuer / interchange",
    processor: "Processor",
    third_party: "Third party",
    merchant_contract: "Merchant agreement",
    tax_or_government: "Tax or government authority",
    unknown: "Not established",
  };
  return labels[value] ?? displayEnum(value);
}

function evidenceStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    statement_confirmed: "Shown on the statement",
    supported_interpretation: "Supported interpretation",
    public_documentation_supported: "Supported by public documentation",
    needs_merchant_pricing_agreement: "Needs the merchant pricing agreement",
    needs_additional_statement_history: "Needs additional statement history",
    needs_processor_explanation: "Needs a processor explanation",
    unresolved: "Unresolved",
  };
  return labels[value] ?? displayEnum(value);
}

function merchantAttentionType(value: string): string {
  return value === "explanation_or_itemization" ? "explanation_or_breakdown" : value;
}

function merchantActionType(value: string): string {
  return value === "request_itemization" ? "request_breakdown" : value;
}

function displayEnum(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function selectedString(fact: CanonicalStatementAnalysis["identity"]["processorName"]): string | null {
  return fact.status === "selected" && typeof fact.value === "string" ? customerCopy(fact.value) : null;
}

function selectedCustomerIdentity(fact: CanonicalStatementAnalysis["identity"]["merchantName"]): string | null {
  if (fact.status !== "selected" || typeof fact.value !== "string" || fact.evidenceRefs.length === 0) return null;
  const value = fact.value.trim();
  if (!value || value.length > 160 || containsUnsafeCustomerIdentity(value)) return null;
  return value;
}

function containsUnsafeCustomerIdentity(value: string): boolean {
  return /(?:^|\s)(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\)|\bPackage\s+[A-Z0-9]\b|\b[A-Fa-f0-9]{32,}\b/i.test(value);
}

function permissionPermitted(analysis: CanonicalStatementAnalysis, key: CanonicalCustomerPermissionKey): boolean {
  return analysis.customerState.permissions.find((permission) => permission.key === key)?.permitted === true;
}

function customerCopy(text: string): string {
  return text
    .replace(/needs itemization/gi, "Needs an explanation")
    .replace(/provide an itemized (?:explanation|description)/gi, "provide a breakdown")
    .replace(/itemization/gi, "a breakdown")
    .replace(/itemized/gi, "broken down")
    .replace(/itemize/gi, "break down")
    .replace(/evidence boundary/gi, "what the statement supports")
    .replace(/service-use review/gi, "service review")
    .replace(/fee inventory/gi, "all charges on this statement")
    .replace(/Questions to Resolve/gi, "What still needs checking");
}

function money(amountMinor: number): MoneyAmount { return { amountMinor, currency: USD }; }

function formatMoney(value: MoneyAmount): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: value.currency }).format(value.amountMinor / 100);
}

function assertValid(analysis: CanonicalStatementAnalysis, projection: ProductionReportProjection): ProductionReportProjection {
  const validation = validateProductionReportProjection(projection);
  const ceiling = validateProductionReportProjectionAgainstCanonical(analysis, projection);
  const errors = [...validation.errors, ...ceiling.errors];
  if (errors.length) throw new Error(`Production report projection rejected: ${errors.join(" ")}`);
  return projection;
}
