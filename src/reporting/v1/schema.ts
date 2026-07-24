import { z } from "zod";
import type { ComponentVisibilityMap, ReportFinding, ReportValue, SingleStatementReportV1 } from "./types.js";
import { round2 } from "./utils.js";

const businessTypeIds = [
  "restaurant_food_beverage",
  "retail",
  "ecommerce",
  "healthcare",
  "hospitality",
  "high_risk",
  "professional_services",
  "other",
] as const;

const reportStateCodes = [
  "unable_to_analyze",
  "reconciliation_failure",
  "low_confidence",
  "verification_required",
  "material_overpayment",
  "above_benchmark_review",
  "healthy_with_opportunities",
  "healthy",
] as const;

const reportStateReasonCodes = [
  "not_a_processing_statement",
  "unreadable_document",
  "incomplete_statement",
  "parser_blocked",
  "missing_core_totals",
  "conflicting_totals",
  "fee_coverage_insufficient",
  "reconciliation_delta_exceeded",
  "analysis_confidence_low",
  "benchmark_unavailable",
  "pricing_model_unconfirmed",
  "material_verification_amount",
  "documentation_required",
  "material_benchmark_gap",
  "material_processor_cost",
  "rate_above_benchmark",
  "competitive_rate_with_findings",
  "competitive_rate_no_findings",
] as const;

const reportComponents = [
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
] as const;

const omissionReasons = [
  "not_applicable",
  "not_extracted",
  "not_verified",
  "low_confidence",
  "benchmark_unavailable",
  "reconciliation_failed",
  "coverage_insufficient",
  "no_supported_findings",
  "no_material_opportunity",
  "parser_blocked",
  "unsupported_processor",
  "insufficient_evidence",
] as const;

const confidenceLevels = ["high", "medium", "low"] as const;
const valueStatuses = ["observed", "calculated", "estimated", "verification_required", "unavailable"] as const;
const reconciliationStatuses = ["pass", "warning", "fail", "not_available"] as const;
const actionTypes = ["retry_upload", "resolve_statement_conflict", "request_documentation", "renegotiate", "compare_quotes", "request_removal", "monitor"] as const;
const benchmarkStatuses = ["below", "within", "above", "unavailable"] as const;
const pricingModels = ["interchange_plus", "itemized", "tiered", "bundled", "flat_rate", "mixed", "unknown"] as const;
const pricingStatuses = ["favorable", "review", "verify", "unknown"] as const;
const feeCategories = ["card_brand_network", "processor_fees", "service_compliance", "needs_review"] as const;
const chargeCadences = ["monthly", "annual", "per_item", "one_time", "unknown"] as const;
const findingDispositions = ["renegotiate", "request_removal", "verify", "monitor"] as const;
const annualizationBasis = ["none", "monthly_charge_times_12", "modeled_future_volume", "mixed"] as const;
const findingCategories = [
  "pricing",
  "processor_markup",
  "per_item_fee",
  "service_fee",
  "compliance",
  "network_fee",
  "downgrade",
  "authorization",
  "dispute",
  "data_quality",
  "other",
] as const;
const impactClassifications = ["deterministic", "estimated", "verification_only", "non_financial"] as const;
const impactLevels = ["high", "medium", "low", "unknown"] as const;
const easeLevels = ["easy", "moderate", "difficult", "unknown"] as const;
const evidenceTypes = ["statement_line", "statement_section", "calculation_input", "reference_schedule"] as const;
const calculationUnits = ["money", "percent", "bps", "count"] as const;
const limitationCodes = [
  "single_statement_snapshot",
  "future_volume_may_change",
  "card_mix_may_change",
  "processor_approval_required",
  "contract_terms_not_reviewed",
  "benchmark_not_available",
  "partial_extraction",
  "classification_incomplete",
  "other",
] as const;

const finiteNumber = z.number().finite();
const nullableFiniteNumber = finiteNumber.nullable();
const reportValuePrimitive = z.union([z.string(), finiteNumber]).nullable();

const reportValueSchema = z
  .object({
    value: reportValuePrimitive,
    status: z.enum(valueStatuses),
    confidence: z.enum(confidenceLevels).nullable(),
    displayLabel: z.string().optional(),
    explanation: z.string().optional(),
    evidenceRefs: z.array(z.string()),
    calculationRef: z.string().optional(),
    unavailableReason: z.enum(omissionReasons).optional(),
  })
  .strict();

const identitySchema = z
  .object({
    merchantName: reportValueSchema,
    processorName: reportValueSchema,
    statementPeriod: reportValueSchema,
    businessType: reportValueSchema
      .extend({
        businessTypeId: z.enum(businessTypeIds).nullable(),
      })
      .strict(),
    sourceFileName: z.string().optional(),
    statementsAnalyzed: z.literal(1),
  })
  .strict();

const dataQualitySchema = z
  .object({
    extractionMode: z.enum(["structured", "text_only", "unusable"]),
    overallConfidence: z.enum(confidenceLevels),
    qualityScore: nullableFiniteNumber,
    reportable: z.boolean(),
    customerFacingTotalsAllowed: z.boolean(),
    feeClassificationAllowed: z.boolean(),
    reasons: z.array(
      z
        .object({
          code: z.string().min(1),
          severity: z.enum(["info", "warning", "critical"]),
          message: z.string().min(1),
          affectedComponents: z.array(z.enum(reportComponents)),
        })
        .strict(),
    ),
  })
  .strict();

const reconciliationSchema = z
  .object({
    status: z.enum(reconciliationStatuses),
    totalFees: reportValueSchema,
    classifiedFeesTotal: reportValueSchema,
    unclassifiedAmount: reportValueSchema,
    coveragePct: reportValueSchema,
    deltaUsd: reportValueSchema,
    toleranceUsd: nullableFiniteNumber,
    reasons: z.array(z.string()),
  })
  .strict();

const verdictSchema = z
  .object({
    tone: z.enum(["positive", "caution", "negative", "verification", "limited", "blocked"]),
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    supportingPoints: z.array(z.string()),
    primaryAction: z.enum(actionTypes),
  })
  .strict();

const metricsSchema = z
  .object({
    processedSales: reportValueSchema,
    totalFees: reportValueSchema,
    effectiveRate: reportValueSchema,
    transactionCount: reportValueSchema,
    averageTicket: reportValueSchema,
  })
  .strict();

const benchmarkSourceSchema = z
  .object({
    sourceId: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    effectiveDate: z.string().optional(),
    methodologyLabel: z.string().min(1),
  })
  .strict();

const benchmarkSchema = z
  .object({
    status: z.enum(benchmarkStatuses),
    eligible: z.boolean(),
    segment: z.string().nullable(),
    lowerRate: nullableFiniteNumber,
    upperRate: nullableFiniteNumber,
    effectiveRate: nullableFiniteNumber,
    deltaFromUpperRate: nullableFiniteNumber,
    source: benchmarkSourceSchema.nullable(),
    confidence: z.enum(confidenceLevels),
    omissionReason: z.enum(omissionReasons).optional(),
  })
  .strict();

const pricingRateSchema = z
  .object({
    label: z.string().min(1),
    ratePct: nullableFiniteNumber,
    perItemUsd: nullableFiniteNumber,
    volumeUsd: nullableFiniteNumber,
    transactionCount: nullableFiniteNumber,
    confidence: z.enum(confidenceLevels),
  })
  .strict();

const pricingModelSchema = z
  .object({
    model: z.enum(pricingModels),
    label: z.string().min(1),
    confidence: z.enum(confidenceLevels),
    status: z.enum(pricingStatuses),
    explanation: z.string().min(1),
    observedRates: z.array(pricingRateSchema),
    evidenceRefs: z.array(z.string()),
    recommendation: z.string().nullable(),
  })
  .strict();

const feeCompositionRowSchema = z
  .object({
    category: z.enum(feeCategories),
    label: z.string().min(1),
    amountUsd: finiteNumber,
    pctOfProcessedSales: nullableFiniteNumber,
    pctOfTotalFees: nullableFiniteNumber,
    confidence: z.enum(confidenceLevels),
    feeRefs: z.array(z.string()),
  })
  .strict();

const feeCompositionSchema = z
  .object({
    status: z.enum(["available", "partial", "unavailable"]),
    totalFees: nullableFiniteNumber,
    rows: z.array(feeCompositionRowSchema),
    coveragePct: nullableFiniteNumber,
    deltaUsd: nullableFiniteNumber,
    omissionReason: z.enum(omissionReasons).optional(),
  })
  .strict();

const feeInventoryRowSchema = z
  .object({
    id: z.string().min(1),
    originalLabel: z.string().min(1),
    displayLabel: z.string().min(1),
    observedAmountUsd: finiteNumber,
    cadence: z.enum(chargeCadences),
    category: z.enum(feeCategories),
    classificationConfidence: z.enum(confidenceLevels),
    classificationExplanation: z.string().nullable(),
    disposition: z.union([z.enum(findingDispositions), z.literal("none")]),
    observedRatePct: nullableFiniteNumber,
    observedPerItemUsd: nullableFiniteNumber,
    observedItemCount: nullableFiniteNumber,
    comparisonTargetType: z.enum(["none", "benchmark", "network_schedule", "negotiation_target", "contract_documentation"]),
    targetRatePct: nullableFiniteNumber,
    targetPerItemUsd: nullableFiniteNumber,
    differenceUsd: nullableFiniteNumber,
    calculationRef: z.string().optional(),
    findingId: z.string().nullable(),
    evidenceRefs: z.array(z.string()),
  })
  .strict();

const feeInventorySchema = z
  .object({
    status: z.enum(["available", "partial", "unavailable"]),
    rows: z.array(feeInventoryRowSchema),
    observedRowCount: z.number().int().nonnegative(),
    displayedRowCount: z.number().int().nonnegative(),
    omissionReason: z.enum(omissionReasons).optional(),
  })
  .strict();

const opportunitySummarySchema = z
  .object({
    deterministicMonthlyImpactUsd: finiteNumber,
    deterministicAnnualImpactUsd: finiteNumber,
    estimatedMonthlyOpportunityUsd: finiteNumber,
    estimatedAnnualOpportunityUsd: finiteNumber,
    totalEligibleMonthlyOpportunityUsd: finiteNumber,
    totalEligibleAnnualOpportunityUsd: finiteNumber,
    verificationMonthlyAmountUsd: finiteNumber,
    verificationAnnualizedAmountUsd: nullableFiniteNumber,
    currency: z.literal("USD"),
    annualizationBasis: z.enum(annualizationBasis),
    includedFindingIds: z.array(z.string()),
    excludedFindingIds: z.array(z.string()),
  })
  .strict();

const findingSchema = z
  .object({
    id: z.string().min(1),
    sourceFindingType: z.string().min(1),
    category: z.enum(findingCategories),
    disposition: z.enum(findingDispositions),
    impactClassification: z.enum(impactClassifications),
    title: z.string().min(1),
    explanation: z.string().min(1),
    merchantAction: z.string().min(1),
    processorQuestion: z.string().min(1),
    currentMonthlyAmountUsd: nullableFiniteNumber,
    currentAnnualizedAmountUsd: nullableFiniteNumber,
    cadence: z.enum(chargeCadences),
    targetMonthlyAmountUsd: nullableFiniteNumber,
    targetRatePct: nullableFiniteNumber,
    estimatedMonthlyImpactUsd: nullableFiniteNumber,
    estimatedAnnualImpactUsd: nullableFiniteNumber,
    impactLevel: z.enum(impactLevels),
    easeLevel: z.enum(easeLevels),
    confidence: z.enum(confidenceLevels),
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

const positiveFindingSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    explanation: z.string().min(1),
    confidence: z.enum(confidenceLevels),
    evidenceRefs: z.array(z.string()),
  })
  .strict();

const actionStepSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().positive(),
    action: z.enum(actionTypes),
    title: z.string().min(1),
    instruction: z.string().min(1),
    relatedFindingIds: z.array(z.string()),
  })
  .strict();

const actionToolkitSchema = z
  .object({
    primaryAction: z.enum(actionTypes),
    summary: z.string().min(1),
    prioritizedSteps: z.array(actionStepSchema),
    processorQuestions: z.array(z.string()),
    negotiationChecklist: z.array(z.string()),
    requiredDocuments: z.array(z.string()),
    followUpChecks: z.array(z.string()),
  })
  .strict();

const evidenceSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(evidenceTypes),
    statementPage: z.number().int().positive().nullable().optional(),
    statementSection: z.string().nullable().optional(),
    originalLabel: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
    sourceId: z.string().nullable().optional(),
    confidence: z.enum(confidenceLevels),
  })
  .strict();

const calculationInputSchema = z
  .object({
    label: z.string().min(1),
    value: finiteNumber,
    unit: z.enum(calculationUnits),
    evidenceRefs: z.array(z.string()),
  })
  .strict();

const calculationSchema = z
  .object({
    id: z.string().min(1),
    formulaCode: z.string().min(1),
    formulaLabel: z.string().min(1),
    inputs: z.array(calculationInputSchema),
    result: finiteNumber,
    unit: z.enum(calculationUnits),
    assumptions: z.array(z.string()),
    confidence: z.enum(confidenceLevels),
  })
  .strict();

const detailsSchema = z
  .object({
    evidence: z.array(evidenceSchema),
    calculations: z.array(calculationSchema),
  })
  .strict();

const methodologySchema = z
  .object({
    statementCount: z.literal(1),
    benchmarkMethod: z.string().nullable(),
    savingsMethod: z.string().min(1),
    reconciliationMethod: z.string().min(1),
    confidenceMethod: z.string().min(1),
  })
  .strict();

const limitationSchema = z
  .object({
    code: z.enum(limitationCodes),
    message: z.string().min(1),
    severity: z.enum(["info", "warning"]),
    affectedFindingIds: z.array(z.string()),
  })
  .strict();

const visibilitySchema = z
  .object({
    status: z.enum(["show", "limited", "hide"]),
    reason: z.enum(omissionReasons).optional(),
    message: z.string().optional(),
  })
  .strict();

const componentVisibilitySchema = z
  .object({
    verdict: visibilitySchema,
    core_metrics: visibilitySchema,
    benchmark: visibilitySchema,
    pricing_model: visibilitySchema,
    fee_composition: visibilitySchema,
    fee_inventory: visibilitySchema,
    opportunity_summary: visibilitySchema,
    findings: visibilitySchema,
    positive_findings: visibilitySchema,
    action_toolkit: visibilitySchema,
    evidence: visibilitySchema,
    methodology: visibilitySchema,
  })
  .strict();

export const singleStatementReportV1Schema = z
  .object({
    contractVersion: z.literal("single_statement_report_v1"),
    policyVersion: z.string().min(1),
    reportId: z.string().min(1),
    generatedAt: z.string().datetime(),
    reportState: z
      .object({
        code: z.enum(reportStateCodes),
        reasons: z.array(z.enum(reportStateReasonCodes)).min(1),
        confidence: z.enum(confidenceLevels),
        evaluatedAt: z.string().datetime(),
      })
      .strict(),
    identity: identitySchema,
    dataQuality: dataQualitySchema,
    reconciliation: reconciliationSchema,
    metrics: metricsSchema,
    opportunitySummary: opportunitySummarySchema,
    componentVisibility: componentVisibilitySchema,
    verdict: verdictSchema,
    benchmark: benchmarkSchema,
    pricingModel: pricingModelSchema,
    feeComposition: feeCompositionSchema,
    feeInventory: feeInventorySchema,
    findings: z.array(findingSchema),
    positiveFindings: z.array(positiveFindingSchema),
    actionToolkit: actionToolkitSchema,
    details: detailsSchema,
    methodology: methodologySchema,
    limitations: z.array(limitationSchema),
  })
  .strict();

export function validateSingleStatementReportV1(report: SingleStatementReportV1): SingleStatementReportV1 {
  singleStatementReportV1Schema.parse(report);
  const errors: string[] = [];
  const evidenceIds = new Set(report.details.evidence.map((item) => item.id));
  const calculationIds = new Set(report.details.calculations.map((item) => item.id));

  visit(report, "$", (path, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) errors.push(`${path} is not finite.`);
  });

  validateReportValue("identity.merchantName", report.identity.merchantName, evidenceIds, calculationIds, errors);
  validateReportValue("identity.processorName", report.identity.processorName, evidenceIds, calculationIds, errors);
  validateReportValue("identity.statementPeriod", report.identity.statementPeriod, evidenceIds, calculationIds, errors);
  validateReportValue("identity.businessType", report.identity.businessType, evidenceIds, calculationIds, errors);
  for (const [key, value] of Object.entries(report.metrics)) validateReportValue(`metrics.${key}`, value, evidenceIds, calculationIds, errors);
  for (const [key, value] of Object.entries(report.reconciliation)) {
    if (isReportValue(value)) validateReportValue(`reconciliation.${key}`, value, evidenceIds, calculationIds, errors);
  }

  for (const finding of report.findings) {
    validateRefs(`findings.${finding.id}`, finding.evidenceRefs, evidenceIds, errors);
    if (finding.calculationRef && !calculationIds.has(finding.calculationRef)) errors.push(`findings.${finding.id}.calculationRef is broken.`);
    if (finding.includedInOpportunityTotal && finding.impactClassification === "verification_only") {
      errors.push(`findings.${finding.id} includes a verification-only amount in opportunity total.`);
    }
  }

  for (const row of report.feeInventory.rows) {
    validateRefs(`feeInventory.${row.id}`, row.evidenceRefs, evidenceIds, errors);
    if (row.calculationRef && !calculationIds.has(row.calculationRef)) errors.push(`feeInventory.${row.id}.calculationRef is broken.`);
  }
  for (const row of report.feeComposition.rows) validateRefs(`feeComposition.${row.category}`, row.feeRefs, evidenceIds, errors);
  for (const positive of report.positiveFindings) validateRefs(`positiveFindings.${positive.id}`, positive.evidenceRefs, evidenceIds, errors);
  for (const calculation of report.details.calculations) {
    for (const input of calculation.inputs) validateRefs(`calculations.${calculation.id}.${input.label}`, input.evidenceRefs, evidenceIds, errors);
  }

  validateVisibility(report.componentVisibility, errors);
  validateOpportunity(report.findings, report.opportunitySummary.totalEligibleAnnualOpportunityUsd, errors);

  if (errors.length > 0) {
    throw new Error(`SingleStatementReportV1 validation failed: ${errors.join(" ")}`);
  }
  return report;
}

function validateReportValue(
  path: string,
  value: ReportValue<unknown>,
  evidenceIds: Set<string>,
  calculationIds: Set<string>,
  errors: string[],
): void {
  if (value.status === "unavailable") {
    if (value.value !== null) errors.push(`${path} is unavailable but contains a value.`);
    if (value.confidence !== null) errors.push(`${path} is unavailable but contains confidence.`);
  }
  if ((value.status === "calculated" || value.status === "estimated") && !value.calculationRef) {
    errors.push(`${path} is ${value.status} but has no calculationRef.`);
  }
  if (value.calculationRef && !calculationIds.has(value.calculationRef)) errors.push(`${path}.calculationRef is broken.`);
  validateRefs(path, value.evidenceRefs, evidenceIds, errors);
}

function validateRefs(path: string, refs: string[], ids: Set<string>, errors: string[]): void {
  for (const ref of refs) {
    if (!ids.has(ref)) errors.push(`${path} evidence ref ${ref} is broken.`);
  }
}

function validateVisibility(map: ComponentVisibilityMap, errors: string[]): void {
  const financial = new Set(["core_metrics", "benchmark", "pricing_model", "fee_composition", "fee_inventory", "opportunity_summary", "findings"]);
  for (const [component, visibility] of Object.entries(map)) {
    if (visibility.status === "hide" && financial.has(component) && !visibility.reason) {
      errors.push(`${component} is hidden without an omission reason.`);
    }
  }
}

function validateOpportunity(findings: ReportFinding[], expectedAnnual: number, errors: string[]): void {
  const total = round2(
    findings
      .filter((finding) => finding.includedInOpportunityTotal)
      .reduce((sum, finding) => {
        if (finding.impactClassification === "verification_only") {
          errors.push(`${finding.id} is verification-only but included.`);
          return sum;
        }
        return sum + annualImpact(finding);
      }, 0),
  );
  if (Math.abs(total - expectedAnnual) > 0.01) {
    errors.push(`Opportunity total ${expectedAnnual} does not match included findings ${total}.`);
  }
}

function annualImpact(finding: ReportFinding): number {
  if (finding.estimatedAnnualImpactUsd !== null) return finding.estimatedAnnualImpactUsd;
  if (finding.currentAnnualizedAmountUsd !== null) return finding.currentAnnualizedAmountUsd;
  if (finding.cadence === "monthly" && finding.estimatedMonthlyImpactUsd !== null) return round2(finding.estimatedMonthlyImpactUsd * 12);
  if (finding.cadence === "monthly" && finding.currentMonthlyAmountUsd !== null) return round2(finding.currentMonthlyAmountUsd * 12);
  return 0;
}

function isReportValue(value: unknown): value is ReportValue<unknown> {
  return Boolean(value && typeof value === "object" && "status" in value && "evidenceRefs" in value);
}

function visit(value: unknown, path: string, fn: (path: string, value: unknown) => void): void {
  fn(path, value);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`, fn));
    return;
  }
  for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`, fn);
}
