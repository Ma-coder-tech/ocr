import { validateProductionReportProjection } from "./productionReportProjectionValidation.js";
import {
  PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION,
  type ProductionMerchantLanguageSource,
  type ProductionReportProjection,
  type ProductionReportablePayload,
} from "./productionReportProjectionTypes.js";
import type {
  CanonicalFeeCategory,
  CanonicalFeeRow,
  CanonicalMerchantAttentionItem,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "./types.js";

const USD = "USD" as const;

export function buildProductionReportProjection(analysis: CanonicalStatementAnalysis): ProductionReportProjection {
  const header = {
    title: "Your RateReveal statement review" as const,
    processor: selectedString(analysis.identity.processorName),
    statementPeriod: analysis.identity.statementPeriod.status === "selected" ? analysis.identity.statementPeriod.value : null,
  };
  if (!reportable(analysis)) {
    return assertValid({
      schemaVersion: PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION,
      experience: "unable_to_complete",
      header,
      recovery: {
        title: "We couldn't complete this statement review",
        explanation: "The statement did not provide enough safe, consistent information to calculate the core results.",
        nextSteps: ["Upload a complete processor statement.", "Make sure the statement includes sales and total fees."],
      },
      report: null,
    });
  }

  const questions = projectQuestions(analysis);
  const experience = questions.length > 0 ? "analysis_available_with_open_questions" : "analysis_completed";
  const languageSource: ProductionMerchantLanguageSource = analysis.merchantAttention.interpretation.source === "admitted_ai_interpretation"
    ? "ai_assisted"
    : "deterministic_fallback";
  const report: ProductionReportablePayload = {
    merchantLanguage: { source: languageSource, degraded: languageSource === "deterministic_fallback" },
    hero: hero(analysis),
    snapshot: {
      heading: "Statement snapshot",
      processedSales: analysis.financialFacts.processedSales.value!,
      totalFees: analysis.financialFacts.totalFees.value!,
      ...(transactionCount(analysis) ? { transactionCount: transactionCount(analysis)! } : {}),
    },
    trustStrip: trustStrip(analysis),
    composition: composition(analysis),
    priorityFindings: findings(analysis, languageSource),
    openQuestions: {
      heading: "What still needs checking",
      status: questions.length ? "shown" : "omitted",
      items: questions,
    },
    allCharges: allCharges(analysis),
    nextActions: nextActions(analysis),
    methodology: {
      heading: "How RateReveal reviewed this statement",
      disclosures: [
        "RateReveal calculates the effective rate from the processed sales and total fees supported by this statement.",
        "Charge explanations are limited to what the statement and accepted reference material support. Uncertain items stay marked for checking.",
        "Reference ranges provide context only. They do not create a savings or overpayment amount.",
      ],
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
  return assertValid({ schemaVersion: PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION, experience, header, recovery: null, report });
}

function reportable(analysis: CanonicalStatementAnalysis): boolean {
  return analysis.validation.status !== "invalid"
    && analysis.financialFacts.processedSales.status === "selected"
    && (analysis.financialFacts.processedSales.value?.amountMinor ?? 0) > 0
    && analysis.financialFacts.totalFees.status === "selected"
    && analysis.financialFacts.totalFees.value !== null
    && analysis.financialFacts.rateRevealCalculatedAllInRate.status === "selected"
    && analysis.financialFacts.rateRevealCalculatedAllInRate.value !== null;
}

function hero(analysis: CanonicalStatementAnalysis): ProductionReportablePayload["hero"] {
  const comparison = analysis.customerState.rateComparison;
  const benchmark = comparison.status === "qualified" && comparison.benchmarkRef?.range && qualifiedRange(comparison.benchmarkRef.range)
    ? {
        label: comparison.benchmarkRef.displayLabel ?? "RateReveal reference range",
        range: { ...comparison.benchmarkRef.range },
        position: comparison.position as "below_reference" | "within_reference" | "above_reference",
        limitations: [...comparison.benchmarkRef.limitations],
      }
    : null;
  const position = benchmark ? comparison.position : "unavailable";
  return {
    heading: "Your effective rate",
    effectiveRate: analysis.financialFacts.rateRevealCalculatedAllInRate.value!,
    benchmark,
    benchmarkUnavailableMessage: benchmark ? null : "A qualified reference range is not available for this statement. Your statement results are still available.",
    interpretation: position === "above_reference"
      ? "Your effective rate is above the qualified reference range. Review the specific charges below before drawing a conclusion."
      : position === "within_reference"
        ? "Your effective rate is within the qualified reference range. Individual charges may still deserve attention."
        : position === "below_reference"
          ? "Your effective rate is below the qualified reference range. Continue to review changes over time."
          : "This statement shows your effective rate, but there is not enough qualified context for a rate comparison.",
    primaryNextAction: analysis.merchantAttention.items.some((item) => item.surfaceEligibility.actionToolkit)
      ? "Start with the highest-priority charge and ask the specific question shown below."
      : "Keep this report and compare future statements for changes.",
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

function trustStrip(analysis: CanonicalStatementAnalysis): ProductionReportablePayload["trustStrip"] {
  const comparison = analysis.customerState.rateComparison;
  const qualifiedBenchmark = comparison.status === "qualified" && Boolean(comparison.benchmarkRef?.range && qualifiedRange(comparison.benchmarkRef.range));
  return {
    items: [
      { label: "Core statement totals", status: analysis.customerState.axes.dataIntegrity === "reconciled" ? "confirmed" : "limited" },
      { label: "Charge coverage", status: analysis.feeLedger.status === "available" ? "confirmed" : "limited" },
      { label: "Reference context", status: qualifiedBenchmark ? "confirmed" : "needs_checking" },
    ],
  };
}

function composition(analysis: CanonicalStatementAnalysis): ProductionReportablePayload["composition"] {
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
  return {
    heading: "Where your fees went",
    status: categories.length === 0 ? "omitted" : partial ? "partial" : "shown",
    categories,
    representedTotal: money(representedMinor),
    statementFeeTotal: money(feeMinor),
    difference: money(differenceMinor),
    reconciled,
    disclosure: partial ? "The visible charge rows do not fully account for the statement fee total, so this breakdown is partial." : null,
    accessibleSummary: categories.length
      ? categories.map((category) => `${category.label}: ${category.amount.amountMinor} cents`).join("; ")
      : "No safe charge breakdown is available.",
  };
}

function findings(analysis: CanonicalStatementAnalysis, languageSource: ProductionMerchantLanguageSource): ProductionReportablePayload["priorityFindings"] {
  const items = analysis.merchantAttention.items.filter((item) => item.surfaceEligibility.priorityFinding).map((item) => ({
    id: item.id,
    title: customerCopy(item.merchantTitle),
    whatStatementShows: customerCopy(item.originalObservedStatementLabel ? `${item.originalObservedStatementLabel} appears on this statement.` : item.whyThisDeservesAttention),
    whatThisLikelyMeans: customerCopy(item.evidenceBoundary.reasonableConclusion.summary),
    whatStillNeedsConfirmation: item.evidenceBoundary.remainingUncertainty.map(customerCopy),
    amount: item.observedAmount,
    languageSource: item.merchantLanguageSource === "admitted_ai_interpretation" ? "ai_assisted" as const : languageSource === "ai_assisted" ? "deterministic_fallback" as const : languageSource,
  }));
  return { heading: "What deserves attention", status: items.length ? "shown" : "omitted", items };
}

function projectQuestions(analysis: CanonicalStatementAnalysis): ProductionReportablePayload["openQuestions"]["items"] {
  const questions = analysis.merchantAttention.items.flatMap((item) => item.questionToResolve ? [{
    id: item.questionToResolve.questionId,
    question: customerCopy(item.questionToResolve.question),
    whatRateRevealKnows: customerCopy(item.questionToResolve.whatRateRevealKnows),
    whatRemainsUncertain: customerCopy(item.questionToResolve.whatRemainsUncertain),
    safeNextStep: customerCopy(item.questionToResolve.safeNextStep),
    amountUnderReview: item.questionToResolve.amountUnderReview,
    amountIsSavings: false as const,
  }] : []);
  const confirmation = analysis.businessQualification.confirmationRequirement;
  if (confirmation) questions.push({
    id: "business_qualification_confirmation",
    question: customerCopy(confirmation.prompt),
    whatRateRevealKnows: "RateReveal kept your business declaration separate from the account coding shown by the processor.",
    whatRemainsUncertain: "The business type, processing channel, or risk profile still needs confirmation before a qualified comparison can be used.",
    safeNextStep: "Confirm the requested business details in RateReveal.",
    amountUnderReview: null,
    amountIsSavings: false,
  });
  return questions;
}

function allCharges(analysis: CanonicalStatementAnalysis): ProductionReportablePayload["allCharges"] {
  const attentionByRow = new Map<string, CanonicalMerchantAttentionItem>();
  for (const item of analysis.merchantAttention.items) for (const rowId of item.feeRowIds) attentionByRow.set(rowId, item);
  const classification = new Map(analysis.feeOwnershipActionability.rowClassifications.map((row) => [row.feeRowId, row.selected.category]));
  const rows = inventoryRows(analysis).map((row) => {
    const attention = attentionByRow.get(row.id);
    const disposition = attention?.inventoryDisposition === "unresolved_review" ? "unresolved" as const
      : attention?.surfaceEligibility.priorityFinding ? "attention" as const
      : attention?.inventoryDisposition === "routine_context" ? "routine" as const
      : "informational" as const;
    return { id: row.id, label: customerCopy(row.selectedLabel), amount: contributionAmount(row), category: classification.get(row.id) ?? "unknown", disposition };
  });
  const partial = analysis.feeLedger.status !== "available" || (rows.length === 0 && analysis.financialFacts.totalFees.value!.amountMinor > 0);
  return {
    heading: "All charges on this statement",
    status: partial ? "partial" : "shown",
    defaultView: "attention",
    completeness: partial ? "partial" : "complete",
    disclosure: partial ? "Some statement charges could not be safely represented as individual rows." : null,
    rows,
  };
}

function nextActions(analysis: CanonicalStatementAnalysis): ProductionReportablePayload["nextActions"] {
  const modules = analysis.merchantAttention.items.filter((item) => item.surfaceEligibility.actionToolkit && item.actionToolkit).map((item) => ({
    id: item.actionToolkit!.moduleId,
    title: item.actionToolkit!.actionType === "request_itemization" ? "Ask for a breakdown" : customerCopy(item.actionToolkit!.whatToDo),
    why: customerCopy(item.actionToolkit!.why),
    exactAsk: item.actionToolkit!.exactAsk ? customerCopy(item.actionToolkit!.exactAsk) : null,
    followUp: item.actionToolkit!.unclearAnswerFollowUp ? customerCopy(item.actionToolkit!.unclearAnswerFollowUp) : null,
    successCriteria: item.actionToolkit!.successCriteria.map(customerCopy),
  }));
  if (modules.length) return { heading: "What to do next", status: "shown", modules, guidance: null };
  return {
    heading: "What to do next",
    status: "guidance",
    modules: [],
    guidance: "No specific charge needs action from this statement alone. Keep the report and monitor future statements for new or changing charges.",
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

function selectedString(fact: CanonicalStatementAnalysis["identity"]["processorName"]): string | null {
  return fact.status === "selected" && typeof fact.value === "string" ? customerCopy(fact.value) : null;
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

function assertValid(projection: ProductionReportProjection): ProductionReportProjection {
  const validation = validateProductionReportProjection(projection);
  if (!validation.valid) throw new Error(`Production report projection rejected: ${validation.errors.join(" ")}`);
  return projection;
}
