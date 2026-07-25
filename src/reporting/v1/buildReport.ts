import { getBusinessTypeReportLabel } from "../../businessTypes.js";
import type { AnalysisSummary, FeeBreakdownRow, StructuredFeeFinding } from "../../types.js";
import { normalizeDataQuality } from "./normalizeDataQuality.js";
import { aggregateOpportunity } from "./opportunity.js";
import { qualifiedBenchmarkRegistry, singleStatementReportV1Policy, structuredFindingCadencePolicy } from "./policyConfig.js";
import { normalizeReconciliation } from "./reconcile.js";
import { resolveReportState } from "./resolveState.js";
import { validateSingleStatementReportV1 } from "./schema.js";
import type {
  ActionToolkit,
  BenchmarkPresentation,
  CalculationInput,
  CalculationRecord,
  ChargeCadence,
  ConfidenceLevel,
  DataQualitySummary,
  EvidenceRef,
  FeeCategoryCode,
  FeeCompositionPresentation,
  FeeCompositionRow,
  FeeInventoryRow,
  FeeInventoryPresentation,
  FindingCategory,
  FindingDisposition,
  ImpactClassification,
  MethodologySummary,
  OmissionReasonCode,
  OpportunitySummary,
  PricingModelCode,
  PricingModelPresentation,
  ReconciliationSummary,
  ReportFinding,
  ReportIdentity,
  ReportLimitation,
  ReportMetrics,
  ReportState,
  ReportValue,
  SingleStatementReportV1,
} from "./types.js";
import {
  arrayOfRecords,
  calculatedValue,
  confidenceFromLabel,
  confidenceFromScore,
  customerSafeExcerpt,
  isFiniteNumber,
  isPositiveFinite,
  numberOrNull,
  observedValue,
  positiveOrNull,
  recordOrNull,
  round2,
  round4,
  safeString,
  stableId,
  unavailableValue,
} from "./utils.js";
import { buildComponentVisibility } from "./visibility.js";

export type BuildSingleStatementReportV1Input = {
  analysis: AnalysisSummary;
  reportId: string;
  generatedAt?: string;
  sourceFileName?: string | null;
  context?: {
    merchantName?: string | null;
  };
};

export type BuildUnableToAnalyzeReportV1Input = {
  reportId: string;
  generatedAt?: string;
  sourceFileName?: string | null;
  reason?: string | null;
};

type BuildCollections = {
  evidence: EvidenceRef[];
  calculations: CalculationRecord[];
};

export function buildSingleStatementReportV1(input: BuildSingleStatementReportV1Input): SingleStatementReportV1 {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const collections: BuildCollections = { evidence: [], calculations: [] };
  const topRefs = addTopLevelEvidence(collections, input.analysis);
  const dataQuality = normalizeDataQuality(input.analysis);
  const metrics = buildMetrics(input.analysis, topRefs, collections);
  const reconciliation = normalizeReconciliation(input.analysis, {
    evidenceRefs: topRefs.totalFees ? [topRefs.totalFees, ...topRefs.feeRows] : topRefs.feeRows,
    calculationRef: "calc_reconciliation",
  });
  addReconciliationCalculation(collections, reconciliation);
  const benchmark = buildBenchmark(input.analysis, metrics, collections);
  const feeInventory = buildFeeInventory(input.analysis, collections);
  const rawFindings = buildFindings(input.analysis, collections, feeInventory);
  const rankedFindings = rankFindings(rawFindings);
  const opportunity = aggregateOpportunity(rankedFindings);
  const linkedFeeInventory = linkFeeInventoryToFindings(feeInventory, opportunity.findings);
  const linkedFeeComposition = buildFeeComposition(input.analysis, reconciliation, linkedFeeInventory);
  const positiveFindings = buildPositiveFindings(input.analysis, benchmark, reconciliation, collections);
  const pricingModel = buildPricingModel(input.analysis, collections);
  const reportState = resolveReportState({
    dataQuality,
    reconciliation,
    metrics,
    benchmark,
    opportunitySummary: opportunity.opportunitySummary,
    findings: opportunity.findings,
    evaluatedAt: generatedAt,
  });
  const projection = applyStateSafetyProjection({
    reportState,
    dataQuality,
    metrics,
    reconciliation,
    benchmark,
    pricingModel,
    feeComposition: linkedFeeComposition,
    feeInventory: linkedFeeInventory,
    opportunitySummary: opportunity.opportunitySummary,
    findings: opportunity.findings,
    positiveFindings,
    details: collections,
  });
  const componentVisibility = buildComponentVisibility({
    state: reportState,
    reconciliation: projection.reconciliation,
    benchmark: projection.benchmark,
    hasFindings: projection.findings.length > 0,
    hasPositiveFindings: projection.positiveFindings.length > 0,
    unavailableReason: projection.unavailableReason,
  });
  const limitations = buildLimitations(projection.benchmark, projection.findings, reportState, projection.unavailableReason);

  return validateSingleStatementReportV1({
    contractVersion: "single_statement_report_v1",
    policyVersion: singleStatementReportV1Policy.policyVersion,
    reportId: input.reportId,
    generatedAt,
    reportState,
    identity: buildIdentity(input.analysis, input.context?.merchantName ?? input.analysis.parserStatementIdentity?.merchantName ?? null, input.sourceFileName ?? undefined),
    dataQuality,
    reconciliation: projection.reconciliation,
    metrics: projection.metrics,
    opportunitySummary: projection.opportunitySummary,
    componentVisibility,
    verdict: verdictFor(reportState.code, projection.opportunitySummary.totalEligibleAnnualOpportunityUsd, projection.unavailableReason),
    benchmark: projection.benchmark,
    pricingModel: projection.pricingModel,
    feeComposition: projection.feeComposition,
    feeInventory: projection.feeInventory,
    findings: projection.findings,
    positiveFindings: projection.positiveFindings,
    actionToolkit: actionToolkitFor(reportState.code, projection.findings, projection.unavailableReason),
    details: projection.details,
    methodology: methodologyFor(projection.benchmark),
    limitations,
  });
}

type StateSafetyProjection = {
  reportState: ReportState;
  dataQuality: DataQualitySummary;
  metrics: ReportMetrics;
  reconciliation: ReconciliationSummary;
  benchmark: BenchmarkPresentation;
  pricingModel: PricingModelPresentation;
  feeComposition: FeeCompositionPresentation;
  feeInventory: FeeInventoryPresentation;
  opportunitySummary: OpportunitySummary;
  findings: ReportFinding[];
  positiveFindings: SingleStatementReportV1["positiveFindings"];
  details: BuildCollections;
};

type ProjectedReportSections = Omit<StateSafetyProjection, "reportState" | "dataQuality"> & {
  unavailableReason?: OmissionReasonCode;
};

function applyStateSafetyProjection(input: StateSafetyProjection): ProjectedReportSections {
  if (input.reportState.code === "unable_to_analyze") {
    const reason = unavailableReasonForUnableToAnalyze(input.reportState, input.dataQuality);
    return {
      metrics: unavailableMetrics(),
      reconciliation: normalizeReconciliation(undefined),
      benchmark: unavailableBenchmark(reason),
      pricingModel: unknownPricingModel(),
      feeComposition: unavailableFeeComposition(reason),
      feeInventory: unavailableFeeInventory(reason),
      opportunitySummary: emptyOpportunitySummary(),
      findings: [],
      positiveFindings: [],
      details: { evidence: [], calculations: [] },
      unavailableReason: reason,
    };
  }

  if (input.reportState.code === "low_confidence" || input.reportState.code === "reconciliation_failure") {
    const findings = input.findings
      .filter((finding) => !finding.includedInOpportunityTotal)
      .map((finding) => ({ ...finding, includedInOpportunityTotal: false }));
    const feeInventory = projectFeeInventoryRelationships(input.feeInventory, findings);
    const projection = {
      metrics: input.metrics,
      reconciliation: input.reconciliation,
      benchmark: input.benchmark,
      pricingModel: input.pricingModel,
      feeComposition: input.feeComposition,
      feeInventory,
      opportunitySummary: zeroEligibleOpportunity(input.opportunitySummary, findings),
      findings,
      positiveFindings: input.positiveFindings,
      details: input.details,
    };
    return {
      ...projection,
      details: pruneDetailsForProjection(input.reportState.code, projection),
    };
  }

  return {
    metrics: input.metrics,
    reconciliation: input.reconciliation,
    benchmark: input.benchmark,
    pricingModel: input.pricingModel,
    feeComposition: input.feeComposition,
    feeInventory: input.feeInventory,
    opportunitySummary: input.opportunitySummary,
    findings: input.findings,
    positiveFindings: input.positiveFindings,
    details: input.details,
  };
}

function unavailableReasonForUnableToAnalyze(reportState: ReportState, dataQuality: DataQualitySummary): OmissionReasonCode {
  if (reportState.reasons.includes("parser_blocked")) {
    const criticalFinancialReasons = dataQuality.reasons.filter(
      (reason) => reason.severity === "critical" && reason.affectedComponents.some((component) => component !== "methodology"),
    );
    if (
      criticalFinancialReasons.some(
        (reason) =>
          reason.code === "parser_decision_missing" ||
          reason.code.includes("validation") ||
          /\b(parser|validation|reconciliation check|parser confidence|parser warning)\b/i.test(reason.message),
      )
    ) {
      return "parser_blocked";
    }
    if (criticalFinancialReasons.some((reason) => reason.code.includes("confidence") || /\bconfidence\b/i.test(reason.message))) return "low_confidence";
    return "insufficient_evidence";
  }
  if (reportState.reasons.includes("missing_core_totals")) return "not_verified";
  if (reportState.reasons.includes("conflicting_totals") || reportState.reasons.includes("reconciliation_delta_exceeded")) return "reconciliation_failed";
  if (reportState.reasons.includes("analysis_confidence_low")) return "low_confidence";
  if (reportState.reasons.includes("unreadable_document")) return "not_extracted";
  if (reportState.reasons.includes("not_a_processing_statement")) return "unsupported_processor";
  return "insufficient_evidence";
}

function emptyOpportunitySummary(): OpportunitySummary {
  return {
    deterministicMonthlyImpactUsd: 0,
    deterministicAnnualImpactUsd: 0,
    estimatedMonthlyOpportunityUsd: 0,
    estimatedAnnualOpportunityUsd: 0,
    totalEligibleMonthlyOpportunityUsd: 0,
    totalEligibleAnnualOpportunityUsd: 0,
    verificationMonthlyAmountUsd: 0,
    verificationAnnualizedAmountUsd: null,
    currency: "USD",
    annualizationBasis: "none",
    includedFindingIds: [],
    excludedFindingIds: [],
  };
}

function zeroEligibleOpportunity(summary: OpportunitySummary, findings: ReportFinding[]): OpportunitySummary {
  return {
    ...summary,
    deterministicMonthlyImpactUsd: 0,
    deterministicAnnualImpactUsd: 0,
    estimatedMonthlyOpportunityUsd: 0,
    estimatedAnnualOpportunityUsd: 0,
    totalEligibleMonthlyOpportunityUsd: 0,
    totalEligibleAnnualOpportunityUsd: 0,
    annualizationBasis: "none",
    includedFindingIds: [],
    excludedFindingIds: findings.map((finding) => finding.id),
  };
}

function unavailableFeeComposition(reason: NonNullable<FeeCompositionPresentation["omissionReason"]>): FeeCompositionPresentation {
  return { status: "unavailable", totalFees: null, rows: [], coveragePct: null, deltaUsd: null, omissionReason: reason };
}

function unavailableFeeInventory(reason: NonNullable<FeeInventoryPresentation["omissionReason"]>): FeeInventoryPresentation {
  return { status: "unavailable", rows: [], observedRowCount: 0, displayedRowCount: 0, omissionReason: reason };
}

function projectFeeInventoryRelationships(feeInventory: FeeInventoryPresentation, findings: ReportFinding[]): FeeInventoryPresentation {
  const retainedIds = new Set(findings.map((finding) => finding.id));
  return {
    ...feeInventory,
    rows: feeInventory.rows.map((row) => {
      const findingId = row.findingId && retainedIds.has(row.findingId) ? row.findingId : null;
      const relatedFindingIds = (row.relatedFindingIds ?? []).filter((id) => retainedIds.has(id));
      const hasRelationship = findingId !== null || relatedFindingIds.length > 0;
      return {
        ...row,
        findingId,
        relatedFindingIds,
        disposition: hasRelationship ? row.disposition : diagnosticFeeDisposition(row),
      };
    }),
  };
}

function diagnosticFeeDisposition(row: FeeInventoryRow): FeeInventoryRow["disposition"] {
  if (row.category === "needs_review" || row.comparisonTargetType === "contract_documentation") return "verify";
  return "none";
}

function pruneDetailsForProjection(stateCode: SingleStatementReportV1["reportState"]["code"], projection: ProjectedReportSections): BuildCollections {
  const calculationIds = new Set<string>();
  const evidenceIds = new Set<string>();
  const addReportValueRefs = (value: ReportValue<unknown>): void => {
    for (const ref of value.evidenceRefs) evidenceIds.add(ref);
    if (value.calculationRef) calculationIds.add(value.calculationRef);
  };

  for (const value of Object.values(projection.metrics)) addReportValueRefs(value);
  for (const value of Object.values(projection.reconciliation)) {
    if (value && typeof value === "object" && "evidenceRefs" in value) addReportValueRefs(value as ReportValue<unknown>);
  }
  for (const ref of projection.pricingModel.evidenceRefs) evidenceIds.add(ref);
  if (stateCode !== "reconciliation_failure" && projection.benchmark.eligible) {
    evidenceIds.add("ev_benchmark_reference");
    calculationIds.add("calc_benchmark_rate_gap");
  }
  for (const row of projection.feeInventory.rows) {
    for (const ref of row.evidenceRefs) evidenceIds.add(ref);
    if (row.calculationRef) calculationIds.add(row.calculationRef);
  }
  for (const finding of projection.findings) {
    for (const ref of finding.evidenceRefs) evidenceIds.add(ref);
    if (finding.calculationRef) calculationIds.add(finding.calculationRef);
  }
  for (const finding of projection.positiveFindings) {
    for (const ref of finding.evidenceRefs) evidenceIds.add(ref);
  }

  const calculations = projection.details.calculations.filter((calculation) => calculationIds.has(calculation.id));
  for (const calculation of calculations) {
    for (const input of calculation.inputs) {
      for (const ref of input.evidenceRefs) evidenceIds.add(ref);
    }
  }

  return {
    evidence: projection.details.evidence.filter((evidence) => evidenceIds.has(evidence.id)),
    calculations,
  };
}

export function buildUnableToAnalyzeReportV1(input: BuildUnableToAnalyzeReportV1Input): SingleStatementReportV1 {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const dataQuality = normalizeDataQuality(undefined);
  if (input.reason) {
    dataQuality.reasons[0] = {
      ...dataQuality.reasons[0]!,
      message: input.reason,
    };
  }
  const metrics = unavailableMetrics();
  const reconciliation = normalizeReconciliation(undefined);
  const benchmark = unavailableBenchmark("benchmark_unavailable");
  const emptyFindings: ReportFinding[] = [];
  const opportunitySummary = aggregateOpportunity(emptyFindings).opportunitySummary;
  const reportState = resolveReportState({
    dataQuality,
    reconciliation,
    metrics,
    benchmark,
    opportunitySummary,
    findings: emptyFindings,
    evaluatedAt: generatedAt,
    analysisFailed: true,
  });
  const unavailableReason = unavailableReasonForUnableToAnalyze(reportState, dataQuality);
  const componentVisibility = buildComponentVisibility({
    state: reportState,
    reconciliation,
    benchmark,
    hasFindings: false,
    hasPositiveFindings: false,
    unavailableReason,
  });

  return validateSingleStatementReportV1({
    contractVersion: "single_statement_report_v1",
    policyVersion: singleStatementReportV1Policy.policyVersion,
    reportId: input.reportId,
    generatedAt,
    reportState,
    identity: {
      merchantName: unavailableValue("not_extracted", "Merchant name was not verified."),
      processorName: unavailableValue("not_extracted", "Processor was not verified."),
      statementPeriod: unavailableValue("not_extracted", "Statement period was not verified."),
      businessType: { ...unavailableValue<string>("not_extracted", "Business type was not verified."), businessTypeId: null },
      sourceFileName: input.sourceFileName ?? undefined,
      statementsAnalyzed: 1,
    },
    dataQuality,
    reconciliation,
    metrics,
    opportunitySummary,
    componentVisibility,
    verdict: verdictFor("unable_to_analyze", 0, unavailableReason),
    benchmark,
    pricingModel: unknownPricingModel(),
    feeComposition: { status: "unavailable", totalFees: null, rows: [], coveragePct: null, deltaUsd: null, omissionReason: unavailableReason },
    feeInventory: { status: "unavailable", rows: [], observedRowCount: 0, displayedRowCount: 0, omissionReason: unavailableReason },
    findings: [],
    positiveFindings: [],
    actionToolkit: actionToolkitFor("unable_to_analyze", [], unavailableReason),
    details: { evidence: [], calculations: [] },
    methodology: methodologyFor(benchmark),
    limitations: [
      {
        code: "partial_extraction",
        message: unableLimitationMessage(unavailableReason),
        severity: "warning",
        affectedFindingIds: [],
      },
    ],
  });
}

function buildIdentity(summary: AnalysisSummary, merchantName: string | null, sourceFileName?: string | null): ReportIdentity {
  const businessLabel = getBusinessTypeReportLabel(summary.businessType);
  return {
    merchantName: merchantName ? observedValue(merchantName, "medium") : unavailableValue("not_extracted", "Merchant name was not verified."),
    processorName:
      summary.processorName && summary.processorName !== "Unknown"
        ? observedValue(summary.processorName, summary.parserStatementIdentity?.processorFamily ? "medium" : "low")
        : unavailableValue("not_extracted", "Processor was not verified."),
    statementPeriod: summary.statementPeriod ? observedValue(summary.statementPeriod, "medium") : unavailableValue("not_extracted", "Statement period was not verified."),
    businessType: {
      ...observedValue(businessLabel, "medium"),
      businessTypeId: summary.businessType,
    },
    sourceFileName: sourceFileName ?? undefined,
    statementsAnalyzed: 1,
  };
}

function buildMetrics(summary: AnalysisSummary, refs: ReturnType<typeof addTopLevelEvidence>, collections: BuildCollections): ReportMetrics {
  const processedSales =
    isPositiveFinite(summary.totalVolume) && refs.totalVolume
      ? observedValue(round2(summary.totalVolume), "high", [refs.totalVolume])
      : unavailableValue<number>("not_verified", "Processed sales were not verified.");
  const totalFees =
    isPositiveFinite(summary.totalFees) && refs.totalFees
      ? observedValue(round2(summary.totalFees), "high", [refs.totalFees])
      : unavailableValue<number>("not_verified", "Total fees were not verified.");

  let effectiveRate: ReportValue<number> = unavailableValue("not_verified", "Effective rate requires verified processed sales and total fees.");
  if (processedSales.value !== null && totalFees.value !== null && isPositiveFinite(summary.effectiveRate)) {
    const calcId = "calc_effective_rate";
    collections.calculations.push({
      id: calcId,
      formulaCode: "effective_rate",
      formulaLabel: "total fees / processed sales * 100",
      inputs: [
        input("Processed sales", processedSales.value, "money", processedSales.evidenceRefs),
        input("Total fees", totalFees.value, "money", totalFees.evidenceRefs),
      ],
      result: round4(summary.effectiveRate),
      unit: "percent",
      assumptions: [],
      confidence: "high",
    });
    effectiveRate = calculatedValue(round4(summary.effectiveRate), "high", calcId, [...processedSales.evidenceRefs, ...totalFees.evidenceRefs]);
  }

  const transactionCountValue = summary.interchangeAudit?.transactionCount ?? summary.processorMarkupAudit?.transactionCount ?? null;
  const transactionCount =
    isPositiveFinite(transactionCountValue) && refs.transactionCount
      ? observedValue(transactionCountValue, "medium", [refs.transactionCount])
      : unavailableValue<number>("not_verified", "Transaction count was not verified.");
  let averageTicket: ReportValue<number> = unavailableValue("not_verified", "Average ticket requires processed sales and transaction count.");
  if (processedSales.value !== null && transactionCount.value !== null) {
    const calcId = "calc_average_ticket";
    const result = round2(processedSales.value / transactionCount.value);
    collections.calculations.push({
      id: calcId,
      formulaCode: "average_ticket",
      formulaLabel: "processed sales / transaction count",
      inputs: [
        input("Processed sales", processedSales.value, "money", processedSales.evidenceRefs),
        input("Transaction count", transactionCount.value, "count", transactionCount.evidenceRefs),
      ],
      result,
      unit: "money",
      assumptions: [],
      confidence: "medium",
    });
    averageTicket = calculatedValue(result, "medium", calcId, [...processedSales.evidenceRefs, ...transactionCount.evidenceRefs]);
  }

  return { processedSales, totalFees, effectiveRate, transactionCount, averageTicket };
}

function buildBenchmark(summary: AnalysisSummary, metrics: ReportMetrics, collections: BuildCollections): BenchmarkPresentation {
  if (metrics.effectiveRate.value === null || !validBenchmark(summary)) return unavailableBenchmark("benchmark_unavailable");
  const registry = qualifiedBenchmarkRegistry[summary.businessType];
  if (!registry) return unavailableBenchmark("benchmark_unavailable");
  const refId = addEvidence(collections, {
    id: "ev_benchmark_reference",
    type: "reference_schedule",
    sourceId: registry.source.sourceId,
    excerpt: registry.limitation,
    confidence: "medium",
  });
  collections.calculations.push({
    id: "calc_benchmark_rate_gap",
    formulaCode: "benchmark_rate_gap_from_upper",
    formulaLabel: "observed effective rate - upper reference boundary",
    inputs: [
      input("Observed effective rate", metrics.effectiveRate.value, "percent", metrics.effectiveRate.evidenceRefs),
      input("Lower reference boundary", summary.benchmark.lowerRate, "percent", [refId]),
      input("Upper reference boundary", summary.benchmark.upperRate, "percent", [refId]),
    ],
    result: round4(Math.max(0, summary.benchmark.deltaFromUpperRate)),
    unit: "percent",
    assumptions: [`Business-type selection factor: ${summary.benchmark.segment}.`],
    confidence: "medium",
  });
  return {
    status: summary.benchmark.status,
    eligible: true,
    segment: summary.benchmark.segment,
    lowerRate: summary.benchmark.lowerRate,
    upperRate: summary.benchmark.upperRate,
    effectiveRate: metrics.effectiveRate.value,
    deltaFromUpperRate: round4(Math.max(0, summary.benchmark.deltaFromUpperRate)),
    source: registry.source,
    confidence: "medium",
  };
}

function unavailableBenchmark(reason: NonNullable<BenchmarkPresentation["omissionReason"]>): BenchmarkPresentation {
  return {
    status: "unavailable",
    eligible: false,
    segment: null,
    lowerRate: null,
    upperRate: null,
    effectiveRate: null,
    deltaFromUpperRate: null,
    source: null,
    confidence: "low",
    omissionReason: reason,
  };
}

function buildFeeInventory(summary: AnalysisSummary, collections: BuildCollections): FeeInventoryPresentation {
  const fiservRows = fiservFeeInventoryRows(summary, collections);
  const genericRows = (summary.feeBreakdown ?? [])
    .filter((row) => isPositiveFinite(row.amount))
    .filter((row) => !fiservRows.some((fiservRow) => sameObservedFee(fiservRow, row, collections)))
    .map((row) => feeInventoryRow(row, collections));
  const rows = [...fiservRows, ...genericRows];
  if (rows.length === 0) return { status: "unavailable", rows: [], observedRowCount: 0, displayedRowCount: 0, omissionReason: "not_extracted" };
  return {
    status: rows.some((row) => row.category === "needs_review") ? "partial" : "available",
    rows,
    observedRowCount: rows.length,
    displayedRowCount: rows.length,
  };
}

function feeInventoryRow(row: FeeBreakdownRow, collections: BuildCollections): FeeInventoryRow {
  const id = stableId(["fee", row.sourceSection, row.label, row.amount, row.evidenceLine]);
  const evidenceId = addEvidence(collections, {
    id: `ev_${id}`,
    type: "statement_line",
    statementPage: null,
    statementSection: row.sourceSection ?? null,
    originalLabel: row.label,
    excerpt: customerSafeExcerpt(row.evidenceLine ?? row.label),
    confidence: confidenceFromLabel(row.classificationConfidence ?? "medium"),
  });
  return {
    id,
    originalLabel: row.label,
    displayLabel: displayFeeLabel(row.label),
    observedAmountUsd: round2(row.amount),
    cadence: "unknown",
    category: feeCategory(row),
    classificationConfidence: confidenceFromLabel(row.classificationConfidence ?? "medium"),
    classificationExplanation: row.classificationReason ?? row.classificationRule ?? null,
    disposition: row.feeClass === "unknown" || row.broadType === "Unknown" ? "verify" : "none",
    observedRatePct: null,
    observedPerItemUsd: null,
    observedItemCount: null,
    comparisonTargetType: row.feeClass === "unknown" || row.broadType === "Unknown" ? "contract_documentation" : "none",
    targetRatePct: null,
    targetPerItemUsd: null,
    differenceUsd: null,
    findingId: null,
    relatedFindingIds: [],
    evidenceRefs: [evidenceId],
  };
}

function fiservFeeInventoryRows(summary: AnalysisSummary, collections: BuildCollections): FeeInventoryRow[] {
  return arrayOfRecords(recordOrNull(summary.fiservFeeAnalysisV2)?.rows)
    .filter((row) => isPositiveFinite(row.amount))
    .map((row) => fiservFeeInventoryRow(row, collections));
}

function fiservFeeInventoryRow(row: Record<string, unknown>, collections: BuildCollections): FeeInventoryRow {
  const label = safeString(row.description) || safeString(row.canonicalName) || "Processor fee";
  const amount = round2(numberOrNull(row.amount) ?? 0);
  const rowIndex = numberOrNull(row.rowIndex);
  const confidence = confidenceFromLabel(safeString(row.matchConfidence) || safeString(row.confidence) || "medium");
  const id = stableId(["fee", "fiserv", rowIndex, safeString(row.sourceSection), label, amount]);
  const evidenceId = addEvidence(collections, {
    id: `ev_${id}`,
    type: "statement_line",
    statementPage: null,
    statementSection: safeString(row.sourceSection) || null,
    originalLabel: label,
    excerpt: customerSafeExcerpt(safeString(row.evidenceLine) || label),
    sourceId: safeString(row.referenceId) || null,
    confidence,
  });
  const expectedAmount = numberOrNull(row.expectedAmount);
  const derivedDifference = expectedAmount !== null ? round2(Math.max(0, amount - expectedAmount)) : null;
  const calculationRef =
    expectedAmount !== null && derivedDifference !== null && derivedDifference > 0
      ? addObservedMinusExpectedCalculation(collections, `calc_${id}_difference`, amount, expectedAmount, [evidenceId], confidence)
      : undefined;
  const comparisonTargetType =
    calculationRef && safeString(row.referenceId)
      ? "network_schedule"
      : safeString(row.proofStatus) === "indeterminate" || safeString(row.proofStatus) === "not_enough_detail"
        ? "contract_documentation"
        : "none";

  return {
    id,
    originalLabel: label,
    displayLabel: displayFeeLabel(label),
    observedAmountUsd: amount,
    cadence: "unknown",
    category: feeCategoryFromFiservRow(row),
    classificationConfidence: confidence,
    classificationExplanation: safeString(row.reason) || null,
    disposition: comparisonTargetType === "contract_documentation" || (derivedDifference !== null && derivedDifference > 0) ? "verify" : "none",
    observedRatePct: numberOrNull(row.rate),
    observedPerItemUsd: null,
    observedItemCount: numberOrNull(row.count),
    comparisonTargetType,
    targetRatePct: null,
    targetPerItemUsd: null,
    differenceUsd: calculationRef ? derivedDifference : null,
    calculationRef,
    findingId: null,
    relatedFindingIds: [],
    evidenceRefs: [evidenceId],
  };
}

function sameObservedFee(row: FeeInventoryRow, source: FeeBreakdownRow, collections: BuildCollections): boolean {
  const left = stableId([row.originalLabel]);
  const right = stableId([source.label]);
  if (left !== right || Math.abs(row.observedAmountUsd - round2(source.amount)) > 0.01) return false;
  const rowEvidence = row.evidenceRefs.map((ref) => evidenceById(collections, ref)).filter((evidence): evidence is EvidenceRef => evidence !== null);
  const sourceSection = optionalStableId(source.sourceSection);
  const sourceExcerpt = optionalStableId(customerSafeExcerpt(source.evidenceLine ?? source.label));
  const sectionMatches = Boolean(sourceSection && rowEvidence.some((evidence) => optionalStableId(evidence.statementSection) === sourceSection));
  const evidenceMatches = Boolean(sourceExcerpt && rowEvidence.some((evidence) => optionalStableId(evidence.excerpt) === sourceExcerpt));
  return sectionMatches || evidenceMatches;
}

function optionalStableId(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  return stableId([value]);
}

function feeCategoryFromFiservRow(row: Record<string, unknown>): FeeCategoryCode {
  const feeType = safeString(row.feeType);
  const proofStatus = safeString(row.proofStatus);
  if (proofStatus === "indeterminate" || proofStatus === "not_enough_detail" || feeType.includes("unknown")) return "needs_review";
  if (/card_brand|network|interchange|pin_debit/.test(feeType)) return "card_brand_network";
  if (/processor|discount|per_item|pct_markup|fixed/.test(feeType)) return "processor_fees";
  if (/compliance|third_party|service|penalty/.test(feeType)) return "service_compliance";
  return "needs_review";
}

function buildFeeComposition(
  summary: AnalysisSummary,
  reconciliation: ReturnType<typeof normalizeReconciliation>,
  feeInventory: FeeInventoryPresentation,
): FeeCompositionPresentation {
  if (feeInventory.rows.length === 0) {
    return { status: "unavailable", totalFees: null, rows: [], coveragePct: null, deltaUsd: null, omissionReason: "not_extracted" };
  }
  if (reconciliation.status === "fail") {
    return {
      status: "unavailable",
      totalFees: summary.totalFees ?? null,
      rows: [],
      coveragePct: reconciliation.coveragePct.value,
      deltaUsd: reconciliation.deltaUsd.value,
      omissionReason: "reconciliation_failed",
    };
  }
  const totals = new Map<FeeCategoryCode, { amount: number; refs: string[]; confidence: ConfidenceLevel }>();
  for (const row of feeInventory.rows) {
    const current = totals.get(row.category) ?? { amount: 0, refs: [], confidence: "high" as ConfidenceLevel };
    current.amount += row.observedAmountUsd;
    current.refs.push(row.id);
    if (row.classificationConfidence === "low") current.confidence = "low";
    else if (row.classificationConfidence === "medium" && current.confidence === "high") current.confidence = "medium";
    totals.set(row.category, current);
  }
  const rows: FeeCompositionRow[] = [...totals.entries()].map(([category, value]) => ({
    category,
    label: feeCategoryLabel(category),
    amountUsd: round2(value.amount),
    pctOfProcessedSales: isPositiveFinite(summary.totalVolume) ? round4((value.amount / summary.totalVolume) * 100) : null,
    pctOfTotalFees: isPositiveFinite(summary.totalFees) ? round4((value.amount / summary.totalFees) * 100) : null,
    confidence: value.confidence,
    feeRefs: value.refs,
  }));
  return {
    status: reconciliation.status === "pass" ? "available" : "partial",
    totalFees: isPositiveFinite(summary.totalFees) ? round2(summary.totalFees) : null,
    rows,
    coveragePct: reconciliation.coveragePct.value,
    deltaUsd: reconciliation.deltaUsd.value,
    omissionReason: reconciliation.status === "pass" ? undefined : "coverage_insufficient",
  };
}

function buildFindings(summary: AnalysisSummary, collections: BuildCollections, feeInventory: FeeInventoryPresentation): ReportFinding[] {
  const structured = (summary.structuredFeeFindings ?? []).map((finding) => structuredFinding(finding, collections, feeInventory));
  const fiserv = fiservFindings(summary, collections, feeInventory);
  const master = fiservMasterFinding(summary, fiserv, collections);
  return [...structured, ...fiserv, ...(master ? [master] : [])].filter((finding): finding is ReportFinding => finding !== null);
}

function structuredFinding(finding: StructuredFeeFinding, collections: BuildCollections, feeInventory: FeeInventoryPresentation): ReportFinding {
  const id = stableId(["structured", finding.kind, finding.rowIndex, finding.label]);
  const confidence = confidenceFromScore(finding.confidence);
  const evidenceId = addEvidence(collections, {
    id: `ev_${id}`,
    type: "statement_line",
    statementSection: finding.sourceSection,
    originalLabel: finding.label,
    excerpt: customerSafeExcerpt(finding.evidenceLine),
    confidence,
  });
  const cadence = cadenceForStructuredFinding(finding);
  const amount = positiveOrNull(finding.estimatedImpactUsd) ?? positiveOrNull(finding.amountUsd);
  const impactClassification: ImpactClassification = finding.kind === "non_emv" ? "verification_only" : "deterministic";
  const calculationRef = amount !== null && cadence === "monthly" ? addAnnualizedCalculation(collections, `calc_${id}`, amount, [evidenceId], confidence) : undefined;
  const monthlyAmount = cadence === "monthly" ? amount : null;
  const annualAmount = amount !== null && cadence === "monthly" ? round2(amount * 12) : null;
  const cadencePolicy = structuredFindingCadencePolicy[finding.kind];
  const feeRowIds = feeRowIdsForStructuredFinding(feeInventory, collections, finding);
  return {
    id,
    sourceFindingType: finding.kind,
    category: finding.kind === "pci_non_compliance" ? "compliance" : finding.kind === "customer_intelligence_suite" ? "service_fee" : "other",
    disposition: impactClassification === "verification_only" ? "verify" : "request_removal",
    impactClassification,
    title: displayFeeLabel(finding.label),
    explanation: finding.kind === "non_emv" ? "This charge requires more context before RateReveal can classify it as avoidable." : "This statement shows a processor-controlled charge worth challenging.",
    merchantAction: impactClassification === "verification_only" ? "Ask the processor to document why this charge applies." : "Ask the processor to remove or justify this charge.",
    processorQuestion: `Can you explain the ${displayFeeLabel(finding.label)} charge and whether it can be removed?`,
    currentMonthlyAmountUsd: monthlyAmount,
    currentAnnualizedAmountUsd: annualAmount,
    cadence,
    targetMonthlyAmountUsd: null,
    targetRatePct: null,
    estimatedMonthlyImpactUsd: monthlyAmount,
    estimatedAnnualImpactUsd: annualAmount,
    impactLevel: impactLevel(annualAmount),
    easeLevel: "unknown",
    confidence,
    originalStatementLabels: [finding.label],
    feeRowIds,
    evidenceRefs: [evidenceId],
    calculationRef,
    assumptions: cadence === "monthly" ? [`${cadencePolicy.methodologyLabel} ${cadencePolicy.limitation}`] : [],
    limitations: cadence === "unknown" ? [cadencePolicy.limitation] : [],
    includedInOpportunityTotal: false,
    rank: 0,
    aggregationKey: stableId(["structured", finding.kind, finding.label]),
    overlapRisk: "none",
  };
}

function cadenceForStructuredFinding(finding: StructuredFeeFinding): ChargeCadence {
  if (explicitMonthlyCadenceEvidence(finding.evidenceLine)) return "monthly";
  return structuredFindingCadencePolicy[finding.kind].cadence;
}

function explicitMonthlyCadenceEvidence(evidenceLine: string): boolean {
  return /\b(monthly|per\s+month|each\s+month|\/\s*mo\.?|month\s+fee)\b/i.test(evidenceLine);
}

function fiservFindings(summary: AnalysisSummary, collections: BuildCollections, feeInventory: FeeInventoryPresentation): ReportFinding[] {
  const analysis = recordOrNull(summary.fiservFeeAnalysisV2);
  if (!analysis) return [];
  const components = arrayOfRecords(recordOrNull(analysis.estimatedAnnualSavings)?.components);
  return arrayOfRecords(analysis.findings)
    .map((finding, index): ReportFinding | null => {
      const kind = safeString(finding.kind);
      const title = safeString(finding.title) || kind || "Fee finding";
      if (!kind || suppressedFinding(kind)) return null;
      const component = componentFor(components, kind, title);
      const id = stableId(["fiserv", kind, index + 1, title]);
      const confidence = confidenceFromLabel(safeString(component?.confidence) || (safeString(finding.severity) === "high" ? "high" : "medium"));
      const evidenceRefs = evidenceForFinding(collections, id, finding, confidence);
      const feeRowIds = feeRowIdsForEvidenceLines(feeInventory, collections, findingEvidenceLines(finding));
      const monthlyCost = positiveOrNull(finding.monthlyCost);
      const annualEstimate = positiveOrNull(finding.annualEstimate) ?? positiveOrNull(component?.annualImpact);
      const impactClassification = fiservImpactClassification(kind, safeString(finding.action), component);
      const cadence: ChargeCadence = monthlyCost !== null ? "monthly" : impactClassification === "non_financial" ? "unknown" : "unknown";
      const annualImpact = cadence === "monthly" && monthlyCost !== null ? round2(monthlyCost * 12) : annualEstimate;
      const calculationRef =
        annualImpact !== null && cadence === "monthly"
          ? addAnnualizedCalculation(collections, `calc_${id}`, monthlyCost ?? round2(annualImpact / 12), evidenceRefs, confidence)
          : undefined;
      return {
        id,
        sourceFindingType: kind,
        category: fiservCategory(kind),
        disposition: fiservDisposition(safeString(finding.action), impactClassification),
        impactClassification,
        title,
        explanation: "RateReveal normalized this processor-specific finding for the v1 safety projection.",
        merchantAction: merchantActionFor(fiservDisposition(safeString(finding.action), impactClassification)),
        processorQuestion: processorQuestionFor(title, fiservDisposition(safeString(finding.action), impactClassification)),
        currentMonthlyAmountUsd: monthlyCost,
        currentAnnualizedAmountUsd: annualImpact,
        cadence,
        targetMonthlyAmountUsd: null,
        targetRatePct: null,
        estimatedMonthlyImpactUsd: monthlyCost,
        estimatedAnnualImpactUsd: annualImpact,
        impactLevel: impactLevel(annualImpact),
        easeLevel: "unknown",
        confidence,
        originalStatementLabels: [title],
        feeRowIds,
        evidenceRefs,
        calculationRef,
        assumptions: cadence === "monthly" ? ["Annualized from the analyzed monthly statement."] : [],
        limitations: cadence === "unknown" ? ["Cadence or overlap is not explicit enough to include this amount in eligible opportunity."] : [],
        includedInOpportunityTotal: false,
        rank: 0,
        aggregationKey: stableId(["fiserv", safeString(component?.sourceFindingKind) || kind, safeString(component?.label) || title]),
        supersedesFindingIds: [],
        overlapRisk: component?.sourceFindingKind ? "none" : "possible",
      };
    })
    .filter((finding): finding is ReportFinding => finding !== null);
}

function fiservMasterFinding(summary: AnalysisSummary, childFindings: ReportFinding[], collections: BuildCollections): ReportFinding | null {
  const savings = recordOrNull(recordOrNull(summary.fiservFeeAnalysisV2)?.estimatedAnnualSavings);
  const estimated = positiveOrNull(savings?.estimated);
  if (savings === null || estimated === null) return null;
  const id = "fiserv_v2_master_estimated_savings";
  const evidenceId = addEvidence(collections, {
    id: "ev_fiserv_v2_master_estimated_savings",
    type: "calculation_input",
    excerpt: customerSafeExcerpt(safeString(savings.basis) || "Master estimated annual savings from processor analysis."),
    confidence: confidenceFromLabel(safeString(savings.confidence)),
  });
  const calcId = `calc_${id}`;
  collections.calculations.push({
    id: calcId,
    formulaCode: "fiserv_master_estimated_savings",
    formulaLabel: "Processor analysis master estimated annual savings",
    inputs: [input("Estimated annual opportunity", estimated, "money", [evidenceId])],
    result: round2(estimated),
    unit: "money",
    assumptions: ["This is the processor analysis master savings figure and supersedes overlapping component impacts."],
    confidence: confidenceFromLabel(safeString(savings.confidence)),
  });
  const feeRowIds = [...new Set(childFindings.flatMap((finding) => finding.feeRowIds))].sort();
  return {
    id,
    sourceFindingType: "fiserv_master_estimated_savings",
    category: "pricing",
    disposition: "renegotiate",
    impactClassification: "estimated",
    title: "Processor analysis estimated pricing opportunity",
    explanation: "This is the master estimated savings figure from the processor-specific analysis. It is used to avoid double-counting component findings.",
    merchantAction: "Use this as a pricing review estimate, not guaranteed savings.",
    processorQuestion: "Can you provide a revised proposal that addresses the pricing and fee issues identified in this statement?",
    currentMonthlyAmountUsd: round2(estimated / 12),
    currentAnnualizedAmountUsd: estimated,
    cadence: "monthly",
    targetMonthlyAmountUsd: null,
    targetRatePct: null,
    estimatedMonthlyImpactUsd: round2(estimated / 12),
    estimatedAnnualImpactUsd: estimated,
    impactLevel: impactLevel(estimated),
    easeLevel: "unknown",
    confidence: confidenceFromLabel(safeString(savings.confidence)),
    originalStatementLabels: [],
    feeRowIds,
    evidenceRefs: [evidenceId],
    calculationRef: calcId,
    assumptions: ["Annualized amounts are estimates from one monthly statement."],
    limitations: ["Actual savings depend on future volume, card mix, processor approval, and contract terms."],
    includedInOpportunityTotal: false,
    rank: 0,
    aggregationKey: "fiserv_master_estimated_savings",
    supersedesFindingIds: childFindings.filter((finding) => finding.impactClassification !== "verification_only").map((finding) => finding.id),
    overlapRisk: "none",
  };
}

function feeRowIdsForStructuredFinding(feeInventory: FeeInventoryPresentation, collections: BuildCollections, finding: StructuredFeeFinding): string[] {
  const amount = positiveOrNull(finding.estimatedImpactUsd) ?? positiveOrNull(finding.amountUsd);
  if (amount === null) return [];
  const normalizedLabel = stableId([finding.label]);
  const normalizedEvidence = customerSafeExcerpt(finding.evidenceLine);
  return feeInventory.rows
    .filter((row) => {
      const labelMatches = stableId([row.originalLabel]) === normalizedLabel;
      const amountMatches = Math.abs(row.observedAmountUsd - round2(amount)) <= 0.01;
      if (!labelMatches || !amountMatches) return false;
      const evidenceMatches = row.evidenceRefs.some((ref) => {
        const evidence = evidenceById(collections, ref);
        return evidence?.excerpt !== null && evidence?.excerpt === normalizedEvidence;
      });
      return evidenceMatches || row.originalLabel === finding.label;
    })
    .map((row) => row.id);
}

function feeRowIdsForEvidenceLines(feeInventory: FeeInventoryPresentation, collections: BuildCollections, lines: string[]): string[] {
  const excerpts = new Set(lines.map(customerSafeExcerpt).filter((line): line is string => Boolean(line)));
  if (excerpts.size === 0) return [];
  return feeInventory.rows
    .filter((row) =>
      row.evidenceRefs.some((ref) => {
        const evidence = evidenceById(collections, ref);
        return evidence?.excerpt !== null && evidence?.excerpt !== undefined && excerpts.has(evidence.excerpt);
      }),
    )
    .map((row) => row.id);
}

function findingEvidenceLines(finding: Record<string, unknown>): string[] {
  return Array.isArray(finding.evidence) ? finding.evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function evidenceById(collections: BuildCollections, id: string): EvidenceRef | null {
  return collections.evidence.find((evidence) => evidence.id === id) ?? null;
}

function linkFeeInventoryToFindings(feeInventory: FeeInventoryPresentation, findings: ReportFinding[]): FeeInventoryPresentation {
  const supersededIds = new Set(findings.flatMap((finding) => finding.supersedesFindingIds ?? []));
  const findingsByFee = new Map<string, ReportFinding[]>();

  for (const finding of findings) {
    for (const feeRowId of finding.feeRowIds) {
      const current = findingsByFee.get(feeRowId) ?? [];
      current.push(finding);
      findingsByFee.set(feeRowId, current);
    }
  }

  return {
    ...feeInventory,
    rows: feeInventory.rows.map((row) => {
      const related = [...(findingsByFee.get(row.id) ?? [])].sort((left, right) => {
        if (left.includedInOpportunityTotal !== right.includedInOpportunityTotal) return left.includedInOpportunityTotal ? -1 : 1;
        return left.rank - right.rank || left.id.localeCompare(right.id);
      });
      const primary = related.find((finding) => !supersededIds.has(finding.id)) ?? null;
      return {
        ...row,
        findingId: primary?.id ?? null,
        relatedFindingIds: related.map((finding) => finding.id),
        disposition: primary?.disposition ?? row.disposition,
      };
    }),
  };
}

function buildPositiveFindings(
  summary: AnalysisSummary,
  benchmark: BenchmarkPresentation,
  reconciliation: ReturnType<typeof normalizeReconciliation>,
  collections: BuildCollections,
) {
  const findings = [];
  if (benchmark.eligible && (benchmark.status === "within" || benchmark.status === "below")) {
    findings.push({
      id: "positive_rate_within_directional_range",
      title: benchmark.status === "below" ? "Effective rate is below the directional range." : "Effective rate is within the directional range.",
      explanation: "This positive finding is based on RateReveal's internal directional reference and is not a guarantee that every fee is optimal.",
      confidence: "medium" as ConfidenceLevel,
      evidenceRefs: ["ev_benchmark_reference"].filter((id) => collections.evidence.some((evidence) => evidence.id === id)),
    });
  }
  if (reconciliation.status === "pass") {
    const id = addEvidence(collections, {
      id: "ev_positive_reconciliation",
      type: "calculation_input",
      excerpt: "Fee categories reconcile within the v1 policy tolerance.",
      confidence: "high",
    });
    findings.push({
      id: "positive_fee_categories_reconcile",
      title: "Fee categories reconcile within policy tolerance.",
      explanation: "The categorized fee rows reconcile closely enough to support complete fee composition.",
      confidence: "high" as ConfidenceLevel,
      evidenceRefs: [id],
    });
  }
  return findings;
}

function buildPricingModel(summary: AnalysisSummary, collections: BuildCollections): PricingModelPresentation {
  const analysisModel = recordOrNull(recordOrNull(summary.fiservFeeAnalysisV2)?.pricingModel);
  const raw = safeString(analysisModel?.pricingModel);
  const mapped = pricingModelCode(raw, summary);
  const confidence = confidenceFromLabel(safeString(analysisModel?.confidence) || (mapped === "unknown" ? "low" : "medium"));
  const evidenceRefs = arrayOfRecords(analysisModel?.evidence)
    .slice(0, 5)
    .map((entry, index) =>
      addEvidence(collections, {
        id: stableId(["ev_pricing_model", index + 1, safeString(entry.description) || raw]),
        type: "statement_line",
        originalLabel: safeString(entry.description) || null,
        excerpt: customerSafeExcerpt(safeString(entry.evidenceLine) || safeString(entry.description)),
        confidence,
      }),
    );
  return {
    model: mapped,
    label: pricingModelLabel(mapped),
    confidence,
    status: mapped === "unknown" ? "unknown" : mapped === "tiered" || mapped === "bundled" ? "review" : "verify",
    explanation:
      mapped === "unknown"
        ? "The current analysis did not confirm a pricing model."
        : "The pricing model is normalized from backend processor-analysis signals. Pricing model and pricing quality are separate conclusions.",
    observedRates: [],
    evidenceRefs,
    recommendation: mapped === "unknown" ? "Ask the processor to confirm the pricing model in writing." : null,
  };
}

function unknownPricingModel(): PricingModelPresentation {
  return {
    model: "unknown",
    label: "Unknown pricing model",
    confidence: "low",
    status: "unknown",
    explanation: "The pricing model was not verified.",
    observedRates: [],
    evidenceRefs: [],
    recommendation: "Upload a complete statement or ask the processor to confirm the pricing model in writing.",
  };
}

function unavailableMetrics(): ReportMetrics {
  return {
    processedSales: unavailableValue("not_verified", "Processed sales were not verified."),
    totalFees: unavailableValue("not_verified", "Total fees were not verified."),
    effectiveRate: unavailableValue("not_verified", "Effective rate was not calculated."),
    transactionCount: unavailableValue("not_verified", "Transaction count was not verified."),
    averageTicket: unavailableValue("not_verified", "Average ticket was not calculated."),
  };
}

function verdictFor(
  code: SingleStatementReportV1["reportState"]["code"],
  annualOpportunity: number,
  unavailableReason?: OmissionReasonCode,
): SingleStatementReportV1["verdict"] {
  if (code === "unable_to_analyze") {
    return {
      tone: "blocked",
      eyebrow: "Unable to analyze",
      title: unableVerdictTitle(unavailableReason),
      summary: unableVerdictSummary(unavailableReason),
      supportingPoints: [],
      primaryAction: "retry_upload",
    };
  }
  if (code === "reconciliation_failure") {
    return {
      tone: "limited",
      eyebrow: "Reconciliation issue",
      title: "We found conflicting totals, so the full financial conclusion is withheld.",
      summary: "Verified facts remain available, but affected savings and composition claims are hidden.",
      supportingPoints: [],
      primaryAction: "resolve_statement_conflict",
    };
  }
  if (code === "low_confidence") {
    return {
      tone: "limited",
      eyebrow: "Limited analysis",
      title: "We could read part of this statement. Here is what we could verify.",
      summary: "Unsupported conclusions are withheld until better evidence is available.",
      supportingPoints: [],
      primaryAction: "retry_upload",
    };
  }
  if (code === "verification_required") {
    return {
      tone: "verification",
      eyebrow: "Verification required",
      title: "Your core numbers are verified, but some charges need documentation.",
      summary: "Verification amounts are separate from estimated opportunity.",
      supportingPoints: [],
      primaryAction: "request_documentation",
    };
  }
  if (code === "material_overpayment") {
    return {
      tone: "negative",
      eyebrow: "Material opportunity",
      title: "Your processing costs appear materially above the supported reference.",
      summary: `Approximately $${Math.round(annualOpportunity).toLocaleString("en-US")} per year is worth reviewing or challenging.`,
      supportingPoints: [],
      primaryAction: "renegotiate",
    };
  }
  if (code === "above_benchmark_review") {
    return {
      tone: "caution",
      eyebrow: "Pricing review",
      title: "Your rate is above the directional benchmark range.",
      summary: "The benchmark gap is a pricing-review signal, not guaranteed savings.",
      supportingPoints: [],
      primaryAction: "renegotiate",
    };
  }
  if (code === "healthy_with_opportunities") {
    return {
      tone: "caution",
      eyebrow: "Healthy with opportunities",
      title: "Your overall rate is competitive, but specific fees are worth reviewing.",
      summary: "Eligible opportunities are separated from charges requiring verification.",
      supportingPoints: [],
      primaryAction: "request_removal",
    };
  }
  return {
    tone: "positive",
    eyebrow: "Healthy",
    title: "Your statement looks healthy this month.",
    summary: "No material cost-reduction opportunity was identified in this statement.",
    supportingPoints: [],
    primaryAction: "monitor",
  };
}

function actionToolkitFor(code: SingleStatementReportV1["reportState"]["code"], findings: ReportFinding[], unavailableReason?: OmissionReasonCode): ActionToolkit {
  const primaryAction = verdictFor(code, 0, unavailableReason).primaryAction;
  const actionable = findings.filter((finding) => finding.confidence !== "low").slice(0, 5);
  return {
    primaryAction,
    summary: code === "unable_to_analyze" ? unableVerdictSummary(unavailableReason) : "Use the prioritized steps supported by this report state.",
    prioritizedSteps: actionable.map((finding, index) => ({
      id: stableId(["step", finding.id]),
      order: index + 1,
      action: actionTypeForDisposition(finding.disposition),
      title: finding.title,
      instruction: finding.merchantAction,
      relatedFindingIds: [finding.id],
    })),
    processorQuestions: actionable.map((finding) => finding.processorQuestion),
    negotiationChecklist: code === "unable_to_analyze" || code === "low_confidence" ? [] : ["Request written confirmation of any pricing or fee changes."],
    requiredDocuments: code === "verification_required" ? ["Processor fee schedule or contract terms for the verification items."] : [],
    followUpChecks: ["Analyze another month before treating annualized amounts as guaranteed."],
  };
}

function unableVerdictTitle(reason: OmissionReasonCode | undefined): string {
  if (reason === "parser_blocked") return "Parser validation blocked this statement from a reliable financial report.";
  if (reason === "not_verified") return "Core statement totals were not verified.";
  if (reason === "reconciliation_failed") return "Statement totals conflicted before a reliable financial report could be produced.";
  if (reason === "low_confidence") return "Analysis confidence was too low for customer-facing financial conclusions.";
  if (reason === "not_extracted") return "Statement data could not be extracted.";
  if (reason === "unsupported_processor") return "This statement type is not supported for financial reporting.";
  return "We could not verify enough of this statement to produce a reliable report.";
}

function unableVerdictSummary(reason: OmissionReasonCode | undefined): string {
  if (reason === "parser_blocked") return "Upload the complete original PDF or a clearer copy with parser-verifiable totals.";
  if (reason === "not_verified") return "Upload a complete statement that clearly shows processed sales, total fees, and effective rate.";
  if (reason === "reconciliation_failed") return "Upload the complete original statement so conflicting totals can be checked.";
  if (reason === "low_confidence") return "Upload a clearer or more complete statement before acting on financial conclusions.";
  if (reason === "not_extracted") return "Upload a text-based original statement or a clearer copy.";
  if (reason === "unsupported_processor") return "Upload a supported processor statement or a statement with verifiable processing totals.";
  return "Upload the complete original PDF or a clearer copy.";
}

function methodologyFor(benchmark: BenchmarkPresentation): MethodologySummary {
  return {
    statementCount: 1,
    benchmarkMethod: benchmark.source?.methodologyLabel ?? null,
    savingsMethod: "Eligible opportunity is deterministic annual impact plus eligible estimated annual opportunity. Verification-only amounts are excluded.",
    reconciliationMethod: "Fee composition passes when coverage is at least 85% and delta is within max($1, 2% of total fees).",
    confidenceMethod: "When multiple confidence signals exist, v1 uses the lower confidence level as the conservative report confidence.",
  };
}

function buildLimitations(
  benchmark: BenchmarkPresentation,
  findings: ReportFinding[],
  reportState?: ReportState,
  unavailableReason?: OmissionReasonCode,
): ReportLimitation[] {
  if (reportState?.code === "unable_to_analyze") {
    return [
      {
        code: "partial_extraction",
        message: unableLimitationMessage(unavailableReason),
        severity: "warning",
        affectedFindingIds: [],
      },
    ];
  }
  const limitations: ReportLimitation[] = [
    {
      code: "single_statement_snapshot",
      message:
        "This analysis is based on one monthly statement. Annualized amounts are estimates, not guarantees, and actual results may vary with future volume, card mix, processor approval, and contract terms.",
      severity: "info",
      affectedFindingIds: findings.filter((finding) => finding.estimatedAnnualImpactUsd !== null || finding.currentAnnualizedAmountUsd !== null).map((finding) => finding.id),
    },
  ];
  if (!benchmark.eligible) {
    limitations.push({
      code: "benchmark_not_available",
      message: "A supported benchmark comparison was not available for this report.",
      severity: "warning",
      affectedFindingIds: [],
    });
  } else {
    const registry = benchmark.source ? Object.values(qualifiedBenchmarkRegistry).find((entry) => entry.source.sourceId === benchmark.source?.sourceId) : null;
    if (registry) {
      limitations.push({
        code: "other",
        message: registry.limitation,
        severity: "info",
        affectedFindingIds: [],
      });
    }
  }
  return limitations;
}

function unableLimitationMessage(reason: OmissionReasonCode | undefined): string {
  if (reason === "parser_blocked") {
    return "RateReveal withheld financial conclusions because parser validation did not approve this statement.";
  }
  if (reason === "not_verified") {
    return "RateReveal withheld financial conclusions because core statement totals were not verified.";
  }
  if (reason === "reconciliation_failed") {
    return "RateReveal withheld financial conclusions because statement totals conflicted before reporting.";
  }
  if (reason === "low_confidence") {
    return "RateReveal withheld financial conclusions because extraction confidence was too low.";
  }
  if (reason === "not_extracted") {
    return "RateReveal withheld financial conclusions because statement data could not be extracted.";
  }
  if (reason === "unsupported_processor") {
    return "RateReveal withheld financial conclusions because this statement type is not supported for financial reporting.";
  }
  return "RateReveal could not verify enough of this statement to produce a reliable financial report.";
}

function addTopLevelEvidence(collections: BuildCollections, summary: AnalysisSummary) {
  const totalVolume = isPositiveFinite(summary.totalVolume)
    ? addEvidence(collections, {
        id: "ev_total_volume",
        type: "calculation_input",
        excerpt: "Approved parser output: total processed sales.",
        confidence: "high",
      })
    : null;
  const totalFees = isPositiveFinite(summary.totalFees)
    ? addEvidence(collections, {
        id: "ev_total_fees",
        type: "calculation_input",
        excerpt: "Approved parser output: total processing fees.",
        confidence: "high",
      })
    : null;
  const transactionCount =
    isPositiveFinite(summary.interchangeAudit?.transactionCount ?? summary.processorMarkupAudit?.transactionCount)
      ? addEvidence(collections, {
          id: "ev_transaction_count",
          type: "calculation_input",
          excerpt: "Approved parser output: transaction count.",
          confidence: "medium",
        })
      : null;
  const feeRows = (summary.feeBreakdown ?? [])
    .filter((row) => isPositiveFinite(row.amount))
    .map((row, index) =>
      addEvidence(collections, {
        id: stableId(["ev_fee", index + 1, row.label]),
        type: "statement_line",
        statementSection: row.sourceSection ?? null,
        originalLabel: row.label,
        excerpt: customerSafeExcerpt(row.evidenceLine ?? row.label),
        confidence: confidenceFromLabel(row.classificationConfidence ?? "medium"),
      }),
    );
  return { totalVolume, totalFees, transactionCount, feeRows };
}

function addReconciliationCalculation(collections: BuildCollections, reconciliation: ReturnType<typeof normalizeReconciliation>): void {
  if (reconciliation.classifiedFeesTotal.value === null || reconciliation.totalFees.value === null || reconciliation.deltaUsd.value === null) return;
  collections.calculations.push({
    id: "calc_reconciliation",
    formulaCode: "fee_reconciliation_delta",
    formulaLabel: "absolute(classified fees total - total fees)",
    inputs: [
      input("Classified fees total", reconciliation.classifiedFeesTotal.value, "money", reconciliation.classifiedFeesTotal.evidenceRefs),
      input("Total fees", reconciliation.totalFees.value, "money", reconciliation.totalFees.evidenceRefs),
    ],
    result: reconciliation.deltaUsd.value,
    unit: "money",
    assumptions: [`Tolerance is $${reconciliation.toleranceUsd?.toFixed(2) ?? "not available"}.`],
    confidence: reconciliation.deltaUsd.confidence ?? "medium",
  });
}

function addAnnualizedCalculation(collections: BuildCollections, id: string, monthlyAmount: number, evidenceRefs: string[], confidence: ConfidenceLevel): string {
  collections.calculations.push({
    id,
    formulaCode: "monthly_charge_times_12",
    formulaLabel: "monthly charge * 12",
    inputs: [input("Monthly charge", monthlyAmount, "money", evidenceRefs)],
    result: round2(monthlyAmount * 12),
    unit: "money",
    assumptions: ["Only one monthly statement was analyzed; annualized amount is descriptive, not guaranteed."],
    confidence,
  });
  return id;
}

function addObservedMinusExpectedCalculation(
  collections: BuildCollections,
  id: string,
  observedAmount: number,
  expectedAmount: number,
  evidenceRefs: string[],
  confidence: ConfidenceLevel,
): string {
  collections.calculations.push({
    id,
    formulaCode: "observed_minus_expected_amount",
    formulaLabel: "observed amount - expected amount",
    inputs: [input("Observed amount", observedAmount, "money", evidenceRefs), input("Expected amount", expectedAmount, "money", evidenceRefs)],
    result: round2(Math.max(0, observedAmount - expectedAmount)),
    unit: "money",
    assumptions: ["Difference is shown only when the backend has an explicit expected amount for the same fee row."],
    confidence,
  });
  return id;
}

function addEvidence(collections: BuildCollections, evidence: EvidenceRef): string {
  if (!collections.evidence.some((item) => item.id === evidence.id)) collections.evidence.push(evidence);
  return evidence.id;
}

function input(label: string, value: number, unit: CalculationInput["unit"], evidenceRefs: string[]): CalculationInput {
  return { label, value, unit, evidenceRefs };
}

function validBenchmark(summary: AnalysisSummary): boolean {
  return (
    summary.benchmark !== undefined &&
    isFiniteNumber(summary.benchmark.lowerRate) &&
    isFiniteNumber(summary.benchmark.upperRate) &&
    summary.benchmark.upperRate > summary.benchmark.lowerRate
  );
}

function rankFindings(findings: ReportFinding[]): ReportFinding[] {
  return [...findings]
    .sort((left, right) => annualImpact(right) - annualImpact(left) || confidenceRank(right.confidence) - confidenceRank(left.confidence) || left.id.localeCompare(right.id))
    .map((finding, index) => ({ ...finding, rank: index + 1 }));
}

function annualImpact(finding: ReportFinding): number {
  return finding.estimatedAnnualImpactUsd ?? finding.currentAnnualizedAmountUsd ?? 0;
}

function confidenceRank(confidence: ConfidenceLevel): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function feeCategory(row: FeeBreakdownRow): FeeCategoryCode {
  if (row.classificationConfidence === "low" || row.feeClass === "unknown" || row.broadType === "Unknown") return "needs_review";
  if (row.feeClass === "card_brand_pass_through" || row.broadType === "Pass-through") return "card_brand_network";
  if (row.feeClass === "processor_markup" || row.feeClass === "processor_transaction_or_auth" || row.broadType === "Processor") return "processor_fees";
  if (row.feeClass === "processor_service_add_on" || row.feeClass === "compliance_remediation" || row.broadType === "Service / compliance") return "service_compliance";
  return "needs_review";
}

function feeCategoryLabel(category: FeeCategoryCode): string {
  if (category === "card_brand_network") return "Card brand / network";
  if (category === "processor_fees") return "Processor fees";
  if (category === "service_compliance") return "Service & compliance";
  return "Needs review";
}

function displayFeeLabel(label: string): string {
  return label
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function impactLevel(annual: number | null): ReportFinding["impactLevel"] {
  if (annual === null) return "unknown";
  if (annual >= 1000) return "high";
  if (annual >= 250) return "medium";
  if (annual > 0) return "low";
  return "unknown";
}

function componentFor(components: Record<string, unknown>[], kind: string, title: string): Record<string, unknown> | null {
  const byKind = components.find((component) => safeString(component.sourceFindingKind) === kind);
  if (byKind) return byKind;
  const normalizedTitle = stableId([title]);
  return components.find((component) => stableId([component.label as string]).includes(normalizedTitle) || normalizedTitle.includes(stableId([component.label as string]))) ?? null;
}

function evidenceForFinding(collections: BuildCollections, id: string, finding: Record<string, unknown>, confidence: ConfidenceLevel): string[] {
  const evidence = Array.isArray(finding.evidence) ? finding.evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  if (evidence.length === 0) {
    return [
      addEvidence(collections, {
        id: `ev_${id}`,
        type: "calculation_input",
        excerpt: "Processor-analysis finding without a statement excerpt in the current projection.",
        confidence,
      }),
    ];
  }
  return evidence.slice(0, 3).map((line, index) =>
    addEvidence(collections, {
      id: stableId(["ev", id, index + 1]),
      type: "statement_line",
      excerpt: customerSafeExcerpt(line),
      confidence,
    }),
  );
}

function fiservImpactClassification(kind: string, action: string, component: Record<string, unknown> | null): ImpactClassification {
  if (action === "request_pass_through_documentation" || kind.includes("reference") || kind.includes("network") || kind.includes("documentation")) {
    return "verification_only";
  }
  if (kind.includes("healthy") || action === "none") return "non_financial";
  if (component?.tier === "confirmed" || kind.includes("junk") || kind.includes("compliance") || kind.includes("third_party")) return "deterministic";
  return "estimated";
}

function fiservDisposition(action: string, impact: ImpactClassification): FindingDisposition {
  if (impact === "verification_only") return "verify";
  if (action === "complete_pci_validation" || action === "verify_third_party_service" || action === "fix_terminal_or_gateway_configuration") return "verify";
  if (action === "request_interchange_plus_quote" || action === "negotiate_processor_rate") return "renegotiate";
  if (impact === "deterministic") return "request_removal";
  return "monitor";
}

function fiservCategory(kind: string): FindingCategory {
  if (kind.includes("benchmark") || kind.includes("pricing")) return "pricing";
  if (kind.includes("auth")) return "authorization";
  if (kind.includes("downgrade")) return "downgrade";
  if (kind.includes("compliance")) return "compliance";
  if (kind.includes("network") || kind.includes("reference")) return "network_fee";
  if (kind.includes("dispute")) return "dispute";
  if (kind.includes("markup")) return "processor_markup";
  if (kind.includes("per_item")) return "per_item_fee";
  return "other";
}

function suppressedFinding(kind: string): boolean {
  return kind === "authorization_ratio_healthy" || kind === "effective_rate_positive_benchmark" || kind === "unknown_fee_learning_candidate";
}

function merchantActionFor(disposition: FindingDisposition): string {
  if (disposition === "renegotiate") return "Ask for repricing or a written pricing proposal.";
  if (disposition === "request_removal") return "Ask the processor to remove this charge or document why it applies.";
  if (disposition === "verify") return "Ask the processor for documentation before treating this as savings.";
  return "Monitor this item and compare against another month.";
}

function processorQuestionFor(title: string, disposition: FindingDisposition): string {
  if (disposition === "verify") return `Please document why ${title} applies and whether it is pass-through, contractual, or processor-controlled.`;
  if (disposition === "renegotiate") return `Can you provide a revised proposal that improves ${title}?`;
  if (disposition === "request_removal") return `Can ${title} be removed or waived going forward?`;
  return `Can you explain ${title} and whether it should recur?`;
}

function actionTypeForDisposition(disposition: FindingDisposition): ActionToolkit["primaryAction"] {
  if (disposition === "renegotiate") return "renegotiate";
  if (disposition === "request_removal") return "request_removal";
  if (disposition === "verify") return "request_documentation";
  return "monitor";
}

function pricingModelCode(raw: string, summary: AnalysisSummary): PricingModelCode {
  if (raw === "interchange_plus") return "interchange_plus";
  if (raw === "tiered_pricing") return "tiered";
  if (raw === "flat_discount_pricing" || raw === "flat_rate" || raw === "flat_rate_bundled" || raw === "single_tier_qualified") return "flat_rate";
  if (summary.bundledPricing?.active) return "bundled";
  return "unknown";
}

function pricingModelLabel(code: PricingModelCode): string {
  if (code === "interchange_plus") return "Interchange-plus";
  if (code === "itemized") return "Itemized";
  if (code === "tiered") return "Tiered";
  if (code === "bundled") return "Bundled";
  if (code === "flat_rate") return "Flat-rate";
  if (code === "mixed") return "Mixed";
  return "Unknown";
}
