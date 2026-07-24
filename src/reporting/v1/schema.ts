import { z } from "zod";
import type { ComponentVisibilityMap, ReportFinding, ReportValue, SingleStatementReportV1 } from "./types.js";
import { round2 } from "./utils.js";

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

const confidenceLevels = ["high", "medium", "low"] as const;

export const singleStatementReportV1Schema = z
  .object({
    contractVersion: z.literal("single_statement_report_v1"),
    policyVersion: z.string().min(1),
    reportId: z.string().min(1),
    generatedAt: z.string().datetime(),
    reportState: z.object({
      code: z.enum(reportStateCodes),
      reasons: z.array(z.string().min(1)).min(1),
      confidence: z.enum(confidenceLevels),
      evaluatedAt: z.string().datetime(),
    }),
    identity: z.unknown(),
    dataQuality: z.unknown(),
    reconciliation: z.unknown(),
    metrics: z.unknown(),
    opportunitySummary: z.unknown(),
    componentVisibility: z.unknown(),
    verdict: z.unknown(),
    benchmark: z.unknown(),
    pricingModel: z.unknown(),
    feeComposition: z.unknown(),
    feeInventory: z.unknown(),
    findings: z.array(z.unknown()),
    positiveFindings: z.array(z.unknown()),
    actionToolkit: z.unknown(),
    details: z.object({
      evidence: z.array(
        z.object({
          id: z.string().min(1),
          type: z.enum(["statement_line", "statement_section", "calculation_input", "reference_schedule"]),
          confidence: z.enum(confidenceLevels),
        }).passthrough(),
      ),
      calculations: z.array(
        z.object({
          id: z.string().min(1),
          result: z.number().finite(),
          inputs: z.array(
            z.object({
              label: z.string().min(1),
              value: z.number().finite(),
              unit: z.enum(["money", "percent", "bps", "count"]),
              evidenceRefs: z.array(z.string()),
            }),
          ),
        }).passthrough(),
      ),
    }),
    methodology: z.unknown(),
    limitations: z.array(z.unknown()),
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
