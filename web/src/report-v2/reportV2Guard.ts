import { z } from "zod";
import type { ProductionReportV2 } from "./reportV2Types";

const text = z.string().min(1).max(4000);
const ref = z.string().min(1).max(240);
const money = z.object({ amountMinor: z.number().int(), currency: z.literal("USD") }).strict();
const owner = z.object({ economicBeneficiary: text, contractualController: text }).strict();
const references = z.object({ evidenceRefs: z.array(ref).max(200), feeRowRefs: z.array(ref).max(200) }).strict();

const finding = z.object({
  id: ref,
  attentionType: text,
  priority: z.enum(["routine", "review", "high_priority"]),
  merchantTitle: text,
  observedLabel: text.nullable(),
  observedAmount: money.nullable(),
  category: text,
  likelyOwner: owner.nullable(),
  evidenceStatus: text,
  confidence: z.enum(["high", "medium", "low"]),
  whyDeservesAttention: text,
  whatStatementShows: text,
  whatThisLikelyMeans: text,
  whatStillNeedsConfirmation: z.array(text).max(40),
  safestNextAction: z.object({ actionType: text, instruction: text }).strict().nullable(),
  references,
  opportunityLinkage: z.object({
    componentRefs: z.array(ref).max(200),
    linkageOnly: z.literal(true),
    moneyIncluded: z.literal(false),
  }).strict().nullable(),
  languageSource: z.enum(["ai_assisted", "deterministic_fallback"]),
}).strict();

const question = z.object({
  id: ref,
  question: text,
  whatRateRevealKnows: text,
  whatRemainsUncertain: text,
  safeNextStep: text,
  requirement: text,
  requiredEvidenceOrConfirmation: z.array(text).min(1).max(40),
  references,
  amountUnderReview: money.nullable(),
  amountIsSavings: z.literal(false),
}).strict();

const charge = z.object({
  id: ref,
  label: text,
  amount: money,
  category: text,
  likelyOwner: owner.nullable(),
  whatRateRevealKnows: text.nullable(),
  evidenceStatus: text,
  disposition: z.enum(["attention", "routine", "unresolved", "informational"]),
  safestAction: z.object({ actionType: text, instruction: text }).strict().nullable(),
  references: z.object({ evidenceRefs: z.array(ref).max(200), feeRowRef: ref }).strict(),
}).strict();

const action = z.object({
  id: ref,
  actionType: text,
  title: text,
  whatToDo: text,
  why: text,
  statementEvidenceRefs: z.array(ref).max(200),
  exactAsk: text.nullable(),
  requestDocumentation: z.array(text).max(40),
  followUp: text.nullable(),
  avoidClaiming: z.array(text).max(40),
  successCriteria: z.array(text).min(1).max(40),
}).strict();

const reportPayload = z.object({
  merchantLanguage: z.object({ source: z.enum(["ai_assisted", "deterministic_fallback"]), degraded: z.boolean() }).strict(),
  hero: z.object({
    status: z.enum(["shown", "omitted"]),
    heading: z.literal("Your effective rate"),
    effectiveRate: text.nullable(),
    benchmark: z.object({
      label: text,
      range: z.object({ low: text, high: text }).strict(),
      position: z.enum(["below_reference", "within_reference", "above_reference"]),
      context: z.object({
        referenceSegment: text.nullable(),
        risk: text.nullable(),
        processingChannel: text.nullable(),
        annualVolume: text.nullable(),
        market: text.nullable(),
        processor: text.nullable(),
        confidence: z.enum(["high", "medium", "low"]),
      }).strict(),
      limitations: z.array(text).max(40),
    }).strict().nullable(),
    benchmarkUnavailableMessage: text.nullable(),
    interpretation: text.nullable(),
    primaryNextAction: text.nullable(),
  }).strict(),
  snapshot: z.object({
    status: z.enum(["shown", "omitted"]),
    heading: z.literal("Statement snapshot"),
    processedSales: money.nullable(),
    totalFees: money.nullable(),
    transactionCount: z.object({
      value: z.number().int().nonnegative(),
      basis: z.enum(["submitted_transactions", "settled_transactions", "authorizations"]),
    }).strict().optional(),
  }).strict(),
  trustStrip: z.object({
    status: z.enum(["shown", "omitted"]),
    items: z.array(z.object({ label: text, status: z.enum(["confirmed", "limited", "needs_checking"]) }).strict()).max(20),
  }).strict(),
  composition: z.object({
    heading: z.literal("Where your fees went"),
    status: z.enum(["shown", "partial", "omitted"]),
    categories: z.array(z.object({ id: ref, label: text, amount: money, rowCount: z.number().int().nonnegative() }).strict()).max(40),
    representedTotal: money.nullable(),
    statementFeeTotal: money.nullable(),
    difference: money.nullable(),
    reconciled: z.boolean().nullable(),
    disclosure: text.nullable(),
    accessibleSummary: text,
  }).strict(),
  priorityFindings: z.object({
    heading: z.literal("What deserves attention"),
    status: z.enum(["shown", "omitted"]),
    items: z.array(finding).max(100),
  }).strict(),
  openQuestions: z.object({
    heading: z.literal("What still needs checking"),
    status: z.enum(["shown", "omitted"]),
    context: z.array(text).max(40),
    items: z.array(question).max(100),
  }).strict(),
  allCharges: z.object({
    heading: z.literal("All charges on this statement"),
    status: z.enum(["shown", "partial", "omitted"]),
    defaultView: z.enum(["attention", "all"]).nullable(),
    completeness: z.enum(["complete", "partial"]),
    disclosure: text.nullable(),
    rows: z.array(charge).max(1000),
  }).strict(),
  nextActions: z.object({
    heading: z.literal("What to do next"),
    status: z.enum(["shown", "guidance", "omitted"]),
    modules: z.array(action).max(100),
    guidance: text.nullable(),
  }).strict(),
  monitoring: z.object({
    heading: z.literal("What to watch next"),
    status: z.enum(["shown", "omitted"]),
    guidance: z.array(text).max(20),
  }).strict(),
  methodology: z.object({ heading: z.literal("How RateReveal reviewed this statement"), disclosures: z.array(text).max(40) }).strict(),
  saveReport: z.object({
    status: z.literal("planned_unavailable"),
    capabilities: z.array(z.object({
      id: z.enum(["download_pdf", "email_copy"]),
      label: text,
      implemented: z.literal(false),
      availability: z.literal("planned"),
    }).strict()).max(2),
  }).strict(),
  continuation: z.object({
    status: z.literal("planned_unavailable"),
    title: z.literal("See what one month can't show"),
    body: text,
    benefits: z.array(text).max(20),
    qualification: text,
    callToAction: z.object({ label: z.literal("Compare 3–6 more months"), implemented: z.literal(false) }).strict(),
  }).strict(),
}).strict();

const productionReportV2Schema = z.object({
  schemaVersion: z.literal("ratereveal_production_report_v2"),
  experience: z.enum(["unable_to_complete", "analysis_available_with_open_questions", "analysis_completed"]),
  header: z.object({
    title: z.literal("Your RateReveal statement review"),
    merchantName: text.nullable(),
    processor: text.nullable(),
    statementPeriod: z.object({ start: text, end: text }).strict().nullable(),
    statementScope: z.literal("One statement analyzed."),
  }).strict(),
  recovery: z.object({
    title: z.literal("We couldn't complete this statement review"),
    reasonCode: text,
    explanation: text,
    nextSteps: z.array(text).min(1).max(20),
  }).strict().nullable(),
  report: reportPayload.nullable(),
}).strict().superRefine((value, context) => {
  if (value.experience === "unable_to_complete") {
    if (!value.recovery || value.report) context.addIssue({ code: "custom", message: "Unable report must contain recovery only." });
    return;
  }
  if (value.recovery || !value.report) context.addIssue({ code: "custom", message: "Reportable experience requires report payload only." });
  if (!value.report) return;
  if (value.report.hero.status === "shown" && !value.report.hero.effectiveRate) context.addIssue({ code: "custom", message: "Shown hero requires an effective rate." });
  if (value.report.hero.status === "omitted" && (value.report.hero.effectiveRate || value.report.hero.benchmark || value.report.hero.interpretation || value.report.hero.primaryNextAction)) {
    context.addIssue({ code: "custom", message: "Omitted hero retained data." });
  }
  if (value.report.snapshot.status === "shown" && (!value.report.snapshot.processedSales || !value.report.snapshot.totalFees)) {
    context.addIssue({ code: "custom", message: "Shown snapshot requires projected totals." });
  }
  if (value.report.snapshot.status === "omitted" && (value.report.snapshot.processedSales || value.report.snapshot.totalFees || value.report.snapshot.transactionCount)) {
    context.addIssue({ code: "custom", message: "Omitted snapshot retained data." });
  }
  if (value.report.composition.status === "omitted" && value.report.composition.categories.length) context.addIssue({ code: "custom", message: "Omitted composition retained categories." });
  if (value.report.priorityFindings.status === "omitted" && value.report.priorityFindings.items.length) context.addIssue({ code: "custom", message: "Omitted findings retained items." });
  if (value.report.openQuestions.status === "omitted" && (value.report.openQuestions.items.length || value.report.openQuestions.context.length)) context.addIssue({ code: "custom", message: "Omitted questions retained content." });
  if (value.report.allCharges.status === "omitted" && (value.report.allCharges.rows.length || value.report.allCharges.defaultView)) context.addIssue({ code: "custom", message: "Omitted inventory retained content." });
  if (value.report.monitoring.status === "omitted" && value.report.monitoring.guidance.length) context.addIssue({ code: "custom", message: "Omitted monitoring retained guidance." });
});

export type ReportV2GuardResult =
  | { ok: true; report: ProductionReportV2 }
  | { ok: false; reason: "missing" | "unsupported" | "invalid" };

export function guardProductionReportV2(value: unknown): ReportV2GuardResult {
  if (value === null || value === undefined) return { ok: false, reason: "missing" };
  if (typeof value === "object" && value && "schemaVersion" in value && (value as { schemaVersion?: unknown }).schemaVersion !== "ratereveal_production_report_v2") {
    return { ok: false, reason: "unsupported" };
  }
  const parsed = productionReportV2Schema.safeParse(value);
  return parsed.success ? { ok: true, report: parsed.data as ProductionReportV2 } : { ok: false, reason: "invalid" };
}

export function reportV2FeatureEnabled(env: ImportMetaEnv = import.meta.env): boolean {
  return env.VITE_RATEREVEAL_REPORT_V2_ENABLED === "true";
}
