import type { MoneyAmount } from "./types.js";

export const PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION = "ratereveal_production_report_v2" as const;

export type ProductionReportExperience =
  | "unable_to_complete"
  | "analysis_available_with_open_questions"
  | "analysis_completed";

export type ProductionReportSectionStatus = "shown" | "partial" | "omitted";
export type ProductionMerchantLanguageSource = "ai_assisted" | "deterministic_fallback";

export type ProductionReportProjection = {
  schemaVersion: typeof PRODUCTION_REPORT_PROJECTION_SCHEMA_VERSION;
  experience: ProductionReportExperience;
  header: {
    title: "Your RateReveal statement review";
    merchantName: string | null;
    processor: string | null;
    statementPeriod: { start: string; end: string } | null;
    statementScope: "One statement analyzed.";
  };
  recovery: null | {
    title: "We couldn't complete this statement review";
    reasonCode:
      | "missing_or_incomplete_statement"
      | "unreadable_or_unsupported_input"
      | "missing_required_financial_facts"
      | "unsafe_or_conflicting_totals"
      | "analysis_withheld"
      | "review_could_not_be_completed";
    explanation: string;
    nextSteps: string[];
  };
  report: ProductionReportablePayload | null;
};

export type ProductionReportablePayload = {
  merchantLanguage: {
    source: ProductionMerchantLanguageSource;
    degraded: boolean;
  };
  hero: {
    status: "shown" | "omitted";
    heading: "Your effective rate";
    effectiveRate: string | null;
    benchmark: null | {
      label: string;
      range: { low: string; high: string };
      position: "below_reference" | "within_reference" | "above_reference";
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
    status: ProductionReportSectionStatus;
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
    items: Array<{
      id: string;
      title: string;
      whatStatementShows: string;
      whatThisLikelyMeans: string;
      whatStillNeedsConfirmation: string[];
      amount: MoneyAmount | null;
      languageSource: ProductionMerchantLanguageSource;
    }>;
  };
  openQuestions: {
    heading: "What still needs checking";
    status: "shown" | "omitted";
    context: string[];
    items: Array<{
      id: string;
      question: string;
      whatRateRevealKnows: string;
      whatRemainsUncertain: string;
      safeNextStep: string;
      amountUnderReview: MoneyAmount | null;
      amountIsSavings: false;
    }>;
  };
  allCharges: {
    heading: "All charges on this statement";
    status: "shown" | "partial" | "omitted";
    defaultView: "attention" | "all" | null;
    completeness: "complete" | "partial";
    disclosure: string | null;
    rows: Array<{
      id: string;
      label: string;
      amount: MoneyAmount;
      category: string;
      disposition: "attention" | "routine" | "unresolved" | "informational";
    }>;
  };
  nextActions: {
    heading: "What to do next";
    status: "shown" | "guidance" | "omitted";
    modules: Array<{
      id: string;
      title: string;
      why: string;
      exactAsk: string | null;
      followUp: string | null;
      successCriteria: string[];
    }>;
    guidance: string | null;
  };
  methodology: {
    heading: "How RateReveal reviewed this statement";
    disclosures: string[];
  };
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

export type ProductionReportProjectionValidation = { valid: boolean; errors: string[] };
