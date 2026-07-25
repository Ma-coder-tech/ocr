import { z } from "zod";
import type { SingleStatementReportV1 } from "./reportV1Types";

const confidence = z.enum(["high", "medium", "low"]);
const reportComponents = z.enum([
  "verdict",
  "core_metrics",
  "benchmark",
  "pricing_model",
  "fee_composition",
  "fee_inventory",
  "opportunity_summary",
  "findings",
  "positive_findings",
  "action_toolkit",
  "evidence",
  "methodology",
]);
const valueStatus = z.enum(["observed", "calculated", "estimated", "verification_required", "unavailable"]);
const finite = z.number().finite();
const nullableFinite = finite.nullable();

const reportValue = z
  .object({
    value: z.union([z.string(), finite]).nullable(),
    status: valueStatus,
    confidence: confidence.nullable(),
    displayLabel: z.string().optional(),
    explanation: z.string().optional(),
    evidenceRefs: z.array(z.string()),
    calculationRef: z.string().optional(),
    unavailableReason: z.string().optional(),
  })
  .strict();

const evidence = z
  .object({
    id: z.string().min(1),
    type: z.enum(["statement_line", "statement_section", "calculation_input", "reference_schedule"]),
    statementPage: z.number().int().positive().nullable().optional(),
    statementSection: z.string().nullable().optional(),
    originalLabel: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
    sourceId: z.string().nullable().optional(),
    confidence,
  })
  .strict();

const calculation = z
  .object({
    id: z.string().min(1),
    formulaCode: z.string().min(1),
    formulaLabel: z.string().min(1),
    inputs: z.array(
      z
        .object({
          label: z.string().min(1),
          value: finite,
          unit: z.enum(["money", "percent", "bps", "count"]),
          evidenceRefs: z.array(z.string()),
        })
        .strict(),
    ),
    result: finite,
    unit: z.enum(["money", "percent", "bps", "count"]),
    assumptions: z.array(z.string()),
    confidence,
  })
  .strict();

const feeInventoryRow = z
  .object({
    id: z.string().min(1),
    originalLabel: z.string().min(1),
    displayLabel: z.string().min(1),
    observedAmountUsd: finite,
    cadence: z.enum(["monthly", "annual", "per_item", "one_time", "unknown"]),
    category: z.enum(["card_brand_network", "processor_fees", "service_compliance", "needs_review"]),
    classificationConfidence: confidence,
    classificationExplanation: z.string().nullable(),
    disposition: z.union([z.enum(["renegotiate", "request_removal", "verify", "monitor"]), z.literal("none")]),
    observedRatePct: nullableFinite,
    observedPerItemUsd: nullableFinite,
    observedItemCount: nullableFinite,
    comparisonTargetType: z.enum(["none", "benchmark", "network_schedule", "negotiation_target", "contract_documentation"]),
    targetRatePct: nullableFinite,
    targetPerItemUsd: nullableFinite,
    differenceUsd: nullableFinite,
    calculationRef: z.string().optional(),
    findingId: z.string().nullable(),
    relatedFindingIds: z.array(z.string()).optional(),
    evidenceRefs: z.array(z.string()),
  })
  .strict();

const finding = z
  .object({
    id: z.string().min(1),
    sourceFindingType: z.string().min(1),
    category: z.string().min(1),
    disposition: z.enum(["renegotiate", "request_removal", "verify", "monitor"]),
    impactClassification: z.enum(["deterministic", "estimated", "verification_only", "non_financial"]),
    title: z.string().min(1),
    explanation: z.string().min(1),
    merchantAction: z.string().min(1),
    processorQuestion: z.string().min(1),
    currentMonthlyAmountUsd: nullableFinite,
    currentAnnualizedAmountUsd: nullableFinite,
    cadence: z.enum(["monthly", "annual", "per_item", "one_time", "unknown"]),
    targetMonthlyAmountUsd: nullableFinite,
    targetRatePct: nullableFinite,
    estimatedMonthlyImpactUsd: nullableFinite,
    estimatedAnnualImpactUsd: nullableFinite,
    impactLevel: z.enum(["high", "medium", "low", "unknown"]),
    easeLevel: z.enum(["easy", "moderate", "difficult", "unknown"]),
    confidence,
    originalStatementLabels: z.array(z.string()),
    feeRowIds: z.array(z.string()),
    evidenceRefs: z.array(z.string()),
    calculationRef: z.string().optional(),
    assumptions: z.array(z.string()),
    limitations: z.array(z.string()),
    includedInOpportunityTotal: z.boolean(),
    rank: z.number().int().nonnegative(),
    aggregationKey: z.string().optional(),
    supersedesFindingIds: z.array(z.string()).optional(),
    overlapRisk: z.enum(["none", "possible"]).optional(),
  })
  .strict();

export const frontendSingleStatementReportV1Schema = z
  .object({
    contractVersion: z.literal("single_statement_report_v1"),
    policyVersion: z.string().min(1),
    reportId: z.string().min(1),
    generatedAt: z.string().min(1),
    reportState: z
      .object({
        code: z.enum([
          "unable_to_analyze",
          "reconciliation_failure",
          "low_confidence",
          "verification_required",
          "material_overpayment",
          "above_benchmark_review",
          "healthy_with_opportunities",
          "healthy",
        ]),
        reasons: z.array(z.string()).min(1),
        confidence,
        evaluatedAt: z.string().min(1),
      })
      .strict(),
    identity: z
      .object({
        merchantName: reportValue,
        processorName: reportValue,
        statementPeriod: reportValue,
        businessType: reportValue.extend({ businessTypeId: z.string().nullable() }).strict(),
        sourceFileName: z.string().optional(),
        statementsAnalyzed: z.literal(1),
      })
      .strict(),
    dataQuality: z
      .object({
        extractionMode: z.enum(["structured", "text_only", "unusable"]),
        overallConfidence: confidence,
        qualityScore: nullableFinite,
        reportable: z.boolean(),
        customerFacingTotalsAllowed: z.boolean(),
        feeClassificationAllowed: z.boolean(),
        reasons: z.array(
          z
            .object({
              code: z.string().min(1),
              severity: z.enum(["info", "warning", "critical"]),
              message: z.string().min(1),
              affectedComponents: z.array(reportComponents),
            })
            .strict(),
        ),
      })
      .strict(),
    reconciliation: z
      .object({
        status: z.enum(["pass", "warning", "fail", "not_available"]),
        totalFees: reportValue,
        classifiedFeesTotal: reportValue,
        unclassifiedAmount: reportValue,
        coveragePct: reportValue,
        deltaUsd: reportValue,
        toleranceUsd: nullableFinite,
        reasons: z.array(z.string()),
      })
      .strict(),
    metrics: z
      .object({
        processedSales: reportValue,
        totalFees: reportValue,
        effectiveRate: reportValue,
        transactionCount: reportValue,
        averageTicket: reportValue,
      })
      .strict(),
    opportunitySummary: z
      .object({
        deterministicMonthlyImpactUsd: finite,
        deterministicAnnualImpactUsd: finite,
        estimatedMonthlyOpportunityUsd: finite,
        estimatedAnnualOpportunityUsd: finite,
        totalEligibleMonthlyOpportunityUsd: finite,
        totalEligibleAnnualOpportunityUsd: finite,
        verificationMonthlyAmountUsd: finite,
        verificationAnnualizedAmountUsd: nullableFinite,
        currency: z.literal("USD"),
        annualizationBasis: z.enum(["none", "monthly_charge_times_12", "modeled_future_volume", "mixed"]),
        includedFindingIds: z.array(z.string()),
        excludedFindingIds: z.array(z.string()),
      })
      .strict(),
    componentVisibility: z.record(reportComponents, z.object({ status: z.enum(["show", "limited", "hide"]), reason: z.string().optional(), message: z.string().optional() }).strict()),
    verdict: z
      .object({
        tone: z.enum(["positive", "caution", "negative", "verification", "limited", "blocked"]),
        eyebrow: z.string().min(1),
        title: z.string().min(1),
        summary: z.string().min(1),
        supportingPoints: z.array(z.string()),
        primaryAction: z.string().min(1),
      })
      .strict(),
    benchmark: z
      .object({
        status: z.enum(["below", "within", "above", "unavailable"]),
        eligible: z.boolean(),
        segment: z.string().nullable(),
        lowerRate: nullableFinite,
        upperRate: nullableFinite,
        effectiveRate: nullableFinite,
        deltaFromUpperRate: nullableFinite,
        source: z
          .object({
            sourceId: z.string().min(1),
            name: z.string().min(1),
            version: z.string().min(1),
            effectiveDate: z.string().optional(),
            methodologyLabel: z.string().min(1),
          })
          .strict()
          .nullable(),
        confidence,
        omissionReason: z.string().optional(),
      })
      .strict(),
    pricingModel: z
      .object({
        model: z.string().min(1),
        label: z.string().min(1),
        confidence,
        status: z.enum(["favorable", "review", "verify", "unknown"]),
        explanation: z.string().min(1),
        observedRates: z.array(
          z
            .object({
              label: z.string().min(1),
              ratePct: nullableFinite,
              perItemUsd: nullableFinite,
              volumeUsd: nullableFinite,
              transactionCount: nullableFinite,
              confidence,
            })
            .strict(),
        ),
        evidenceRefs: z.array(z.string()),
        recommendation: z.string().nullable(),
      })
      .strict(),
    feeComposition: z
      .object({
        status: z.enum(["available", "partial", "unavailable"]),
        totalFees: nullableFinite,
        rows: z.array(
          z
            .object({
              category: z.enum(["card_brand_network", "processor_fees", "service_compliance", "needs_review"]),
              label: z.string().min(1),
              amountUsd: finite,
              pctOfProcessedSales: nullableFinite,
              pctOfTotalFees: nullableFinite,
              confidence,
              feeRefs: z.array(z.string()),
            })
            .strict(),
        ),
        coveragePct: nullableFinite,
        deltaUsd: nullableFinite,
        omissionReason: z.string().optional(),
      })
      .strict(),
    feeInventory: z.object({ status: z.enum(["available", "partial", "unavailable"]), rows: z.array(feeInventoryRow), observedRowCount: z.number().int().nonnegative(), displayedRowCount: z.number().int().nonnegative(), omissionReason: z.string().optional() }).strict(),
    findings: z.array(finding),
    positiveFindings: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), explanation: z.string().min(1), confidence, evidenceRefs: z.array(z.string()) }).strict()),
    actionToolkit: z.unknown(),
    details: z.object({ evidence: z.array(evidence), calculations: z.array(calculation) }).strict(),
    methodology: z.object({ statementCount: z.literal(1), benchmarkMethod: z.string().nullable(), savingsMethod: z.string().min(1), reconciliationMethod: z.string().min(1), confidenceMethod: z.string().min(1) }).strict(),
    limitations: z.array(z.object({ code: z.string().min(1), message: z.string().min(1), severity: z.enum(["info", "warning"]), affectedFindingIds: z.array(z.string()) }).strict()),
  })
  .strict();

export type ReportV1GuardResult =
  | { ok: true; report: SingleStatementReportV1 }
  | { ok: false; reason: "missing" | "unsupported_version" | "invalid"; message: string };

export function guardSingleStatementReportV1(value: unknown): ReportV1GuardResult {
  if (value === null || value === undefined) return { ok: false, reason: "missing", message: "reportV1 was not supplied." };
  if (typeof value !== "object") return { ok: false, reason: "invalid", message: "reportV1 was malformed." };
  if ((value as { contractVersion?: unknown }).contractVersion !== "single_statement_report_v1") {
    return { ok: false, reason: "unsupported_version", message: "This report version is not supported by this browser build." };
  }
  const parsed = frontendSingleStatementReportV1Schema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "invalid", message: "reportV1 did not match the expected contract." };
  return { ok: true, report: parsed.data as SingleStatementReportV1 };
}
