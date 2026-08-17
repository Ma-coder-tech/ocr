import type { ProductionReportV2, ReportV2Charge, ReportV2Finding } from "./reportV2Types";

export type ReportV2FixtureKey =
  | "above_reference_findings"
  | "within_reference_findings"
  | "within_reference_clean"
  | "comparison_unavailable"
  | "business_confirmation"
  | "high_risk_within_range"
  | "material_unresolved_fee"
  | "unable_to_complete";

const money = (amountMinor: number) => ({ amountMinor, currency: "USD" as const });

const finding: ReportV2Finding = {
  id: "finding_synthetic_processor_markup",
  attentionType: "potential_negotiation",
  priority: "high_priority",
  merchantTitle: "Processor pricing deserves a closer look",
  observedLabel: "PROCESSOR MARKUP",
  observedAmount: money(41822),
  category: "Processor markup",
  likelyOwner: { economicBeneficiary: "Processor", contractualController: "Processor" },
  evidenceStatus: "Supported interpretation",
  confidence: "high",
  whyDeservesAttention: "This is one of the largest processor-controlled charges on the statement.",
  whatStatementShows: "The statement shows a $418.22 processor markup charge.",
  whatThisLikelyMeans: "The charge appears related to the processor-controlled portion of pricing.",
  whatStillNeedsConfirmation: ["The statement does not establish whether the current pricing terms can be changed."],
  safestNextAction: { actionType: "request_pricing_review", instruction: "Ask the processor to explain the current pricing schedule." },
  references: { evidenceRefs: ["synthetic_evidence_markup"], feeRowRefs: ["synthetic_fee_markup"] },
  opportunityLinkage: null,
  languageSource: "deterministic_fallback",
};

const charges: ReportV2Charge[] = [
  {
    id: "synthetic_fee_interchange",
    label: "VISA INTERCHANGE",
    amount: money(121844),
    category: "Interchange",
    likelyOwner: { economicBeneficiary: "Card issuer / interchange", contractualController: "Card network" },
    whatRateRevealKnows: "This charge is shown on the statement and is categorized as interchange.",
    evidenceStatus: "Shown on the statement",
    disposition: "routine",
    safestAction: null,
    references: { evidenceRefs: ["synthetic_evidence_interchange"], feeRowRef: "synthetic_fee_interchange" },
  },
  {
    id: "synthetic_fee_markup",
    label: "PROCESSOR MARKUP",
    amount: money(41822),
    category: "Processor markup",
    likelyOwner: { economicBeneficiary: "Processor", contractualController: "Processor" },
    whatRateRevealKnows: "The statement shows this processor-controlled pricing charge.",
    evidenceStatus: "Supported interpretation",
    disposition: "attention",
    safestAction: { actionType: "request_pricing_review", instruction: "Ask the processor to explain the current pricing schedule." },
    references: { evidenceRefs: ["synthetic_evidence_markup"], feeRowRef: "synthetic_fee_markup" },
  },
  {
    id: "synthetic_fee_service",
    label: "MONTHLY SERVICE FEE",
    amount: money(1995),
    category: "Service fee",
    likelyOwner: { economicBeneficiary: "Processor", contractualController: "Merchant agreement" },
    whatRateRevealKnows: "The statement shows a recurring service fee.",
    evidenceStatus: "Shown on the statement",
    disposition: "routine",
    safestAction: null,
    references: { evidenceRefs: ["synthetic_evidence_service"], feeRowRef: "synthetic_fee_service" },
  },
  {
    id: "synthetic_fee_unclear",
    label: "ADDITIONAL FEES",
    amount: money(948),
    category: "Needs review",
    likelyOwner: { economicBeneficiary: "Not established", contractualController: "Not established" },
    whatRateRevealKnows: "The statement shows this charge but does not explain what it covers.",
    evidenceStatus: "Unresolved",
    disposition: "unresolved",
    safestAction: { actionType: "request_breakdown", instruction: "Ask for a breakdown of the service or program behind this charge." },
    references: { evidenceRefs: ["synthetic_evidence_unclear"], feeRowRef: "synthetic_fee_unclear" },
  },
];

const base: ProductionReportV2 = {
  schemaVersion: "ratereveal_production_report_v2",
  experience: "analysis_available_with_open_questions",
  header: {
    title: "Your RateReveal statement review",
    merchantName: "Synthetic Harbor Café",
    processor: "Fiserv",
    statementPeriod: { start: "2026-07-01", end: "2026-07-31" },
    statementScope: "One statement analyzed.",
  },
  recovery: null,
  report: {
    merchantLanguage: { source: "deterministic_fallback", degraded: true },
    hero: {
      status: "shown",
      heading: "Your effective rate",
      effectiveRate: "0.029400",
      benchmark: {
        label: "RateReveal restaurant reference range",
        range: { low: "0.021000", high: "0.026000" },
        position: "above_reference",
        context: {
          referenceSegment: "Restaurant / Food Service",
          risk: "Standard risk",
          processingChannel: "Card present",
          annualVolume: "$500,000–$2 million annually",
          market: "United States",
          processor: "Fiserv",
          confidence: "high",
        },
        limitations: ["Context only; individual pricing terms and card mix can affect the result."],
      },
      benchmarkUnavailableMessage: null,
      interpretation: "Your effective rate is above the qualified reference range. Review the specific charges below before drawing a conclusion.",
      primaryNextAction: "Start with the processor pricing charge and ask for the current pricing schedule.",
    },
    snapshot: {
      status: "shown",
      heading: "Statement snapshot",
      processedSales: money(8581200),
      totalFees: money(252294),
      transactionCount: { value: 1482, basis: "submitted_transactions" },
    },
    trustStrip: {
      status: "shown",
      items: [
        { label: "Processed sales verified", status: "confirmed" },
        { label: "Processing fees verified", status: "confirmed" },
        { label: "Charge and fee reconciliation", status: "confirmed" },
        { label: "One-statement scope", status: "confirmed" },
      ],
    },
    composition: {
      heading: "Where your fees went",
      status: "shown",
      categories: [
        { id: "interchange", label: "Interchange", amount: money(121844), rowCount: 12 },
        { id: "network", label: "Network fees", amount: money(66685), rowCount: 8 },
        { id: "processor", label: "Processor markup", amount: money(52622), rowCount: 4 },
        { id: "services", label: "Services", amount: money(10195), rowCount: 2 },
        { id: "unresolved", label: "Unresolved", amount: money(948), rowCount: 1 },
      ],
      representedTotal: money(252294),
      statementFeeTotal: money(252294),
      difference: money(0),
      reconciled: true,
      disclosure: null,
      accessibleSummary: "Interchange: $1,218.44; Network fees: $666.85; Processor markup: $526.22; Services: $101.95; Unresolved: $9.48",
    },
    priorityFindings: { heading: "What deserves attention", status: "shown", items: [finding] },
    openQuestions: {
      heading: "What still needs checking",
      status: "shown",
      context: ["At least one statement-supported item still requires verification."],
      items: [{
        id: "question_synthetic_markup",
        question: "How does this charge compare with the current merchant pricing agreement?",
        whatRateRevealKnows: "The statement contains an observed processor markup charge for $418.22.",
        whatRemainsUncertain: "The statement does not establish removability, contractual error, or recoverable savings.",
        safeNextStep: "Ask the processor for the current pricing schedule.",
        requirement: "merchant_pricing_agreement_required",
        requiredEvidenceOrConfirmation: ["Current merchant pricing agreement or pricing schedule"],
        references: { evidenceRefs: ["synthetic_evidence_markup"], feeRowRefs: ["synthetic_fee_markup"] },
        amountUnderReview: money(41822),
        amountIsSavings: false,
      }],
    },
    allCharges: {
      heading: "All charges on this statement",
      status: "shown",
      defaultView: "attention",
      completeness: "complete",
      disclosure: null,
      rows: charges,
    },
    nextActions: {
      heading: "What to do next",
      status: "shown",
      modules: [{
        id: "action_synthetic_pricing",
        actionType: "request_pricing_review",
        title: "Ask for a pricing review",
        whatToDo: "Ask the processor to review the account's current pricing and provide the current pricing schedule.",
        why: "The accepted pricing and ownership context supports review, but the statement alone does not establish an overcharge.",
        statementEvidenceRefs: ["synthetic_evidence_markup"],
        exactAsk: "Please provide the current pricing schedule and explain the processor-controlled components on this statement.",
        requestDocumentation: ["Current merchant pricing agreement", "Current pricing schedule"],
        followUp: "If the answer is unclear, ask for a written response identifying the applicable pricing term.",
        avoidClaiming: ["Do not describe the observed amount as savings or an overcharge without separate support."],
        successCriteria: ["A written answer identifies the charge, applicable term, and any evidence-based next step."],
      }],
      guidance: null,
    },
    monitoring: { heading: "What to watch next", status: "omitted", guidance: [] },
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
  },
};

function clone(): ProductionReportV2 {
  return structuredClone(base);
}

const above = clone();

const within = clone();
within.report!.hero.effectiveRate = "0.024800";
within.report!.hero.benchmark!.position = "within_reference";
within.report!.hero.interpretation = "Your effective rate is within the qualified reference range. Individual charges may still deserve attention.";

const clean = clone();
clean.experience = "analysis_completed";
clean.report!.hero.effectiveRate = "0.023900";
clean.report!.hero.benchmark!.position = "within_reference";
clean.report!.hero.interpretation = "Your effective rate is within the qualified reference range. Continue to watch recurring charges over time.";
clean.report!.hero.primaryNextAction = null;
clean.report!.priorityFindings = { heading: "What deserves attention", status: "omitted", items: [] };
clean.report!.openQuestions = { heading: "What still needs checking", status: "omitted", context: [], items: [] };
clean.report!.nextActions = { heading: "What to do next", status: "omitted", modules: [], guidance: null };
clean.report!.monitoring = {
  heading: "What to watch next",
  status: "shown",
  guidance: [
    "Keep this statement as a baseline.",
    "Compare your effective rate and recurring charges on the next statement.",
    "Watch for new charges or changes to recurring charges.",
  ],
};
clean.report!.allCharges.defaultView = "all";
clean.report!.allCharges.rows = clean.report!.allCharges.rows.map((row) => row.disposition === "unresolved" ? {
  ...row,
  label: "BATCH PROCESSING FEE",
  category: "Service fee",
  whatRateRevealKnows: "This processing fee is shown on the statement.",
  evidenceStatus: "Shown on the statement",
  disposition: "routine",
  safestAction: null,
} : { ...row, disposition: "routine", safestAction: null });

const unavailable = clone();
unavailable.report!.hero.benchmark = null;
unavailable.report!.hero.benchmarkUnavailableMessage = "A qualified reference range is not available for this statement. Your statement results are still available.";
unavailable.report!.hero.interpretation = "This statement shows your effective rate, but there is not enough qualified context for a rate comparison.";

const confirmation = clone();
confirmation.report!.openQuestions.items = [{
  id: "business_qualification_confirmation",
  question: "Confirm whether most transactions are card-present or card-not-present.",
  whatRateRevealKnows: "RateReveal kept your business declaration separate from the account coding shown by the processor.",
  whatRemainsUncertain: "The processing channel still needs confirmation before a qualified comparison can be used.",
  safeNextStep: "Confirm the requested business details in RateReveal.",
  requirement: "merchant_confirmation_required",
  requiredEvidenceOrConfirmation: ["Merchant confirmation of the processing channel"],
  references: { evidenceRefs: [], feeRowRefs: [] },
  amountUnderReview: null,
  amountIsSavings: false,
}];
confirmation.report!.hero.benchmark = null;
confirmation.report!.hero.benchmarkUnavailableMessage = "A qualified reference range is not available until the processing channel is confirmed.";

const highRisk = clone();
highRisk.header.merchantName = "Synthetic Horizon Market";
highRisk.report!.hero.benchmark!.context.risk = "Higher-risk category";
highRisk.report!.hero.benchmark!.context.referenceSegment = "Specialty retail";
highRisk.report!.hero.benchmark!.position = "within_reference";
highRisk.report!.hero.effectiveRate = "0.025500";
highRisk.report!.hero.benchmark!.label = "RateReveal specialty-retail reference range";
highRisk.report!.hero.interpretation = "Your effective rate is within the qualified reference range for the projected higher-risk context. Individual charges may still deserve attention.";

const unresolved = clone();
unresolved.report!.priorityFindings.items = [{
  ...finding,
  id: "finding_synthetic_unresolved",
  attentionType: "explanation_or_breakdown",
  priority: "review",
  merchantTitle: "An unclear charge needs an explanation",
  observedLabel: "ADDITIONAL FEES",
  observedAmount: money(948),
  category: "Needs review",
  likelyOwner: { economicBeneficiary: "Not established", contractualController: "Not established" },
  evidenceStatus: "Unresolved",
  confidence: "low",
  whyDeservesAttention: "The statement confirms the charge without enough detail to understand what it covers.",
  whatStatementShows: "The statement shows an additional-fees charge of $9.48.",
  whatThisLikelyMeans: "The charge needs a breakdown before a stronger conclusion is appropriate.",
  whatStillNeedsConfirmation: ["The service, program, or pricing term behind the charge remains unknown."],
  safestNextAction: { actionType: "request_breakdown", instruction: "Ask for a breakdown of the charge." },
  references: { evidenceRefs: ["synthetic_evidence_unclear"], feeRowRefs: ["synthetic_fee_unclear"] },
}];

const unable: ProductionReportV2 = {
  schemaVersion: "ratereveal_production_report_v2",
  experience: "unable_to_complete",
  header: {
    title: "Your RateReveal statement review",
    merchantName: null,
    processor: null,
    statementPeriod: null,
    statementScope: "One statement analyzed.",
  },
  recovery: {
    title: "We couldn't complete this statement review",
    reasonCode: "unreadable_or_unsupported_input",
    explanation: "RateReveal could not safely read this input as a supported processor statement.",
    nextSteps: ["Upload a clear, text-readable statement from a supported processor.", "Avoid screenshots or cropped pages when a full statement file is available."],
  },
  report: null,
};

export const reportV2Fixtures: Record<ReportV2FixtureKey, ProductionReportV2> = {
  above_reference_findings: above,
  within_reference_findings: within,
  within_reference_clean: clean,
  comparison_unavailable: unavailable,
  business_confirmation: confirmation,
  high_risk_within_range: highRisk,
  material_unresolved_fee: unresolved,
  unable_to_complete: unable,
};

export const malformedReportV2Fixture = { schemaVersion: "ratereveal_production_report_v2", experience: "analysis_completed" };
export const unsupportedReportV2Fixture = { ...unable, schemaVersion: "ratereveal_production_report_v3" };
