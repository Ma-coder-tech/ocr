export type MoneyAmount = { amountMinor: number; currency: "USD" };

export type ReportV2Experience =
  | "unable_to_complete"
  | "analysis_available_with_open_questions"
  | "analysis_completed";

export type ReportV2LanguageSource = "ai_assisted" | "deterministic_fallback";

export type ProductionReportV2 = {
  schemaVersion: "ratereveal_production_report_v2";
  experience: ReportV2Experience;
  header: {
    title: "Your RateReveal statement review";
    merchantName: string | null;
    processor: string | null;
    statementPeriod: { start: string; end: string } | null;
    statementScope: "One statement analyzed.";
  };
  recovery: null | {
    title: "We couldn't complete this statement review";
    reasonCode: string;
    explanation: string;
    nextSteps: string[];
  };
  report: ReportV2Payload | null;
};

export type ReportV2Payload = {
  merchantLanguage: { source: ReportV2LanguageSource; degraded: boolean };
  hero: {
    status: "shown" | "omitted";
    heading: "Your effective rate";
    effectiveRate: string | null;
    benchmark: null | {
      label: string;
      range: { low: string; high: string };
      position: "below_reference" | "within_reference" | "above_reference";
      context: {
        referenceSegment: string | null;
        risk: string | null;
        processingChannel: string | null;
        annualVolume: string | null;
        market: string | null;
        processor: string | null;
        confidence: "high" | "medium" | "low";
      };
      limitations: string[];
    };
    benchmarkUnavailableMessage: string | null;
    interpretation: string | null;
    primaryNextAction: string | null;
  };
  snapshot: {
    status: "shown" | "omitted";
    heading: "Statement snapshot";
    processedSales: MoneyAmount | null;
    totalFees: MoneyAmount | null;
    transactionCount?: { value: number; basis: "submitted_transactions" | "settled_transactions" | "authorizations" };
  };
  trustStrip: {
    status: "shown" | "omitted";
    items: Array<{ label: string; status: "confirmed" | "limited" | "needs_checking" }>;
  };
  composition: {
    heading: "Where your fees went";
    status: "shown" | "partial" | "omitted";
    categories: Array<{ id: string; label: string; amount: MoneyAmount; rowCount: number }>;
    representedTotal: MoneyAmount | null;
    statementFeeTotal: MoneyAmount | null;
    difference: MoneyAmount | null;
    reconciled: boolean | null;
    disclosure: string | null;
    accessibleSummary: string;
  };
  priorityFindings: {
    heading: "What deserves attention";
    status: "shown" | "omitted";
    items: ReportV2Finding[];
  };
  openQuestions: {
    heading: "What still needs checking";
    status: "shown" | "omitted";
    context: string[];
    items: ReportV2Question[];
  };
  allCharges: {
    heading: "All charges on this statement";
    status: "shown" | "partial" | "omitted";
    defaultView: "attention" | "all" | null;
    completeness: "complete" | "partial";
    disclosure: string | null;
    rows: ReportV2Charge[];
  };
  nextActions: {
    heading: "What to do next";
    status: "shown" | "guidance" | "omitted";
    modules: ReportV2Action[];
    guidance: string | null;
  };
  monitoring: {
    heading: "What to watch next";
    status: "shown" | "omitted";
    guidance: string[];
  };
  methodology: { heading: "How RateReveal reviewed this statement"; disclosures: string[] };
  saveReport: {
    status: "planned_unavailable";
    capabilities: Array<{
      id: "download_pdf" | "email_copy";
      label: string;
      implemented: false;
      availability: "planned";
    }>;
  };
  continuation: {
    status: "planned_unavailable";
    title: "See what one month can't show";
    body: string;
    benefits: string[];
    qualification: string;
    callToAction: { label: "Compare 3–6 more months"; implemented: false };
  };
};

export type ReportV2Finding = {
  id: string;
  attentionType: string;
  priority: "routine" | "review" | "high_priority";
  merchantTitle: string;
  observedLabel: string | null;
  observedAmount: MoneyAmount | null;
  category: string;
  likelyOwner: { economicBeneficiary: string; contractualController: string } | null;
  evidenceStatus: string;
  confidence: "high" | "medium" | "low";
  whyDeservesAttention: string;
  whatStatementShows: string;
  whatThisLikelyMeans: string;
  whatStillNeedsConfirmation: string[];
  safestNextAction: { actionType: string; instruction: string } | null;
  references: { evidenceRefs: string[]; feeRowRefs: string[] };
  opportunityLinkage: { componentRefs: string[]; linkageOnly: true; moneyIncluded: false } | null;
  languageSource: ReportV2LanguageSource;
};

export type ReportV2Question = {
  id: string;
  question: string;
  whatRateRevealKnows: string;
  whatRemainsUncertain: string;
  safeNextStep: string;
  requirement: string;
  requiredEvidenceOrConfirmation: string[];
  references: { evidenceRefs: string[]; feeRowRefs: string[] };
  amountUnderReview: MoneyAmount | null;
  amountIsSavings: false;
};

export type ReportV2Charge = {
  id: string;
  label: string;
  amount: MoneyAmount;
  category: string;
  likelyOwner: { economicBeneficiary: string; contractualController: string } | null;
  whatRateRevealKnows: string | null;
  evidenceStatus: string;
  disposition: "attention" | "routine" | "unresolved" | "informational";
  safestAction: { actionType: string; instruction: string } | null;
  references: { evidenceRefs: string[]; feeRowRef: string };
};

export type ReportV2Action = {
  id: string;
  actionType: string;
  title: string;
  whatToDo: string;
  why: string;
  statementEvidenceRefs: string[];
  exactAsk: string | null;
  requestDocumentation: string[];
  followUp: string | null;
  avoidClaiming: string[];
  successCriteria: string[];
};
