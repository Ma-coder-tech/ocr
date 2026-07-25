import type { ComponentVisibility, ReportComponentId, ReportStateCode, ReportValue, SingleStatementReportV1 } from "./reportV1Types";

const components: ReportComponentId[] = [
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
];

const stateTitles: Record<ReportStateCode, string> = {
  healthy: "Your statement looks healthy this month.",
  healthy_with_opportunities: "Your overall rate is competitive, but some fees are worth challenging.",
  above_benchmark_review: "Your rate is above the expected range.",
  material_overpayment: "Your processing costs appear materially above the expected range.",
  verification_required: "Some material charges need documentation before we draw a conclusion.",
  low_confidence: "We could read part of this statement. Here's what we could verify.",
  reconciliation_failure: "We found conflicting totals, so we're withholding the full financial conclusion.",
  unable_to_analyze: "We couldn't verify enough of this statement to produce a reliable report.",
};

const stateReasons: Record<ReportStateCode, string> = {
  healthy: "competitive_rate_no_findings",
  healthy_with_opportunities: "competitive_rate_with_findings",
  above_benchmark_review: "rate_above_benchmark",
  material_overpayment: "material_processor_cost",
  verification_required: "material_verification_amount",
  low_confidence: "analysis_confidence_low",
  reconciliation_failure: "reconciliation_delta_exceeded",
  unable_to_analyze: "parser_blocked",
};

export const reportV1Fixtures: Record<ReportStateCode, SingleStatementReportV1> = {
  healthy: makeFixture("healthy"),
  healthy_with_opportunities: makeFixture("healthy_with_opportunities"),
  above_benchmark_review: makeFixture("above_benchmark_review"),
  material_overpayment: makeFixture("material_overpayment"),
  verification_required: makeFixture("verification_required"),
  low_confidence: makeFixture("low_confidence"),
  reconciliation_failure: makeFixture("reconciliation_failure"),
  unable_to_analyze: makeFixture("unable_to_analyze"),
};

export const malformedReportV1Fixture = { contractVersion: "single_statement_report_v1", reportState: { code: "healthy" } };
export const unsupportedReportV1Fixture = { ...reportV1Fixtures.healthy, contractVersion: "single_statement_report_v2" };

function makeFixture(state: ReportStateCode): SingleStatementReportV1 {
  const blocked = state === "unable_to_analyze";
  const low = state === "low_confidence";
  const reconciliationFailure = state === "reconciliation_failure";
  const verification = state === "verification_required";
  const healthy = state === "healthy";
  const material = state === "material_overpayment";
  const above = state === "above_benchmark_review";
  const withOpps = state === "healthy_with_opportunities" || material || above;
  const visibility = visibilityFor(state);
  const findings = blocked || healthy || low ? [] : findingSet(state);
  const feeRows = blocked ? [] : feeRowsFor(state);
  const feeCompositionRows = blocked || reconciliationFailure ? [] : [
    {
      category: "card_brand_network" as const,
      label: "Card brand/network",
      amountUsd: 1218.44,
      pctOfProcessedSales: 1.05,
      pctOfTotalFees: 48.2,
      confidence: "high" as const,
      feeRefs: ["fee_network"],
    },
    {
      category: "processor_fees" as const,
      label: "Processor fees",
      amountUsd: 778.22,
      pctOfProcessedSales: 0.67,
      pctOfTotalFees: 30.8,
      confidence: "high" as const,
      feeRefs: ["fee_markup"],
    },
    {
      category: "service_compliance" as const,
      label: "Service and compliance",
      amountUsd: 309.95,
      pctOfProcessedSales: 0.27,
      pctOfTotalFees: 12.3,
      confidence: "medium" as const,
      feeRefs: ["fee_monthly"],
    },
    {
      category: "needs_review" as const,
      label: "Needs review",
      amountUsd: 219.4,
      pctOfProcessedSales: 0.19,
      pctOfTotalFees: 8.7,
      confidence: "medium" as const,
      feeRefs: ["fee_integrity"],
    },
  ];
  const deterministicMonthlyImpactUsd = material ? 214.95 : state === "healthy_with_opportunities" ? 64.95 : 0;
  const deterministicAnnualImpactUsd = material ? 2579.4 : state === "healthy_with_opportunities" ? 779.4 : 0;
  const estimatedMonthlyOpportunityUsd = material ? 184.22 : above ? 142.5 : 0;
  const estimatedAnnualOpportunityUsd = material ? 2210.64 : above ? 1710 : 0;
  const totalEligibleMonthlyOpportunityUsd = deterministicMonthlyImpactUsd + estimatedMonthlyOpportunityUsd;
  const totalEligibleAnnualOpportunityUsd = deterministicAnnualImpactUsd + estimatedAnnualOpportunityUsd;

  return {
    contractVersion: "single_statement_report_v1",
    policyVersion: "fixture-package-3-v1",
    reportId: `fixture_${state}`,
    generatedAt: "2026-07-24T12:00:00.000Z",
    reportState: {
      code: state,
      reasons: [stateReasons[state]],
      confidence: low || blocked ? "low" : "high",
      evaluatedAt: "2026-07-24T12:00:00.000Z",
    },
    identity: {
      merchantName: textValue(state === "unable_to_analyze" ? null : state === "healthy_with_opportunities" ? "Very Long Merchant Name For Layout Testing Coffee Roasters LLC" : "M P Painting LLC"),
      processorName: textValue(blocked ? "Processor unconfirmed" : "Paysafe"),
      statementPeriod: textValue(blocked ? null : "February 2024"),
      businessType: { ...textValue("Professional services"), businessTypeId: "professional_services" },
      sourceFileName: "fixture-statement.pdf",
      statementsAnalyzed: 1,
    },
    dataQuality: {
      extractionMode: blocked ? "unusable" : low ? "text_only" : "structured",
      overallConfidence: low || blocked ? "low" : "high",
      qualityScore: blocked ? null : low ? 0.42 : 0.91,
      reportable: !blocked,
      customerFacingTotalsAllowed: !blocked,
      feeClassificationAllowed: !(blocked || low),
      reasons:
        blocked || low || reconciliationFailure
          ? [
              {
                code: blocked ? "parser_blocked" : low ? "analysis_confidence_low" : "reconciliation_delta_exceeded",
                severity: blocked || reconciliationFailure ? "critical" : "warning",
                message: blocked
                  ? "RateReveal could not verify enough of this statement to produce a reliable financial report."
                  : low
                    ? "Several statement sections were readable, but important evidence was incomplete."
                    : "The categorized fee rows did not reconcile cleanly to the statement total.",
                affectedComponents: blocked ? components : ["benchmark", "opportunity_summary", "fee_composition"],
              },
            ]
          : [],
    },
    reconciliation: {
      status: blocked ? "not_available" : reconciliationFailure ? "fail" : state === "healthy_with_opportunities" ? "warning" : "pass",
      totalFees: numberValue(blocked ? null : 2526.01, blocked ? "unavailable" : "observed", "e_total_fees"),
      classifiedFeesTotal: numberValue(blocked ? null : reconciliationFailure ? 2210.11 : 2521.1, blocked ? "unavailable" : "calculated", "e_total_fees", "calc_reconciliation"),
      unclassifiedAmount: numberValue(blocked ? null : reconciliationFailure ? 315.9 : 4.91, blocked ? "unavailable" : "calculated", "e_total_fees", "calc_reconciliation"),
      coveragePct: numberValue(blocked ? null : reconciliationFailure ? 87.5 : 99.8, blocked ? "unavailable" : "calculated", "e_total_fees", "calc_reconciliation"),
      deltaUsd: numberValue(blocked ? null : reconciliationFailure ? 315.9 : 4.91, blocked ? "unavailable" : "calculated", "e_total_fees", "calc_reconciliation"),
      toleranceUsd: blocked ? null : 25,
      reasons: reconciliationFailure ? ["Fee category totals differed from the total fees by more than the reporting tolerance."] : [],
    },
    metrics: {
      processedSales: numberValue(blocked ? null : 116320.55, blocked ? "unavailable" : "observed", "e_sales"),
      totalFees: numberValue(blocked ? null : 2526.01, blocked ? "unavailable" : "observed", "e_total_fees"),
      effectiveRate: numberValue(blocked ? null : healthy ? 2.17 : material ? 3.12 : above ? 2.89 : 2.31, blocked ? "unavailable" : "calculated", "e_sales", "calc_effective_rate"),
      transactionCount: numberValue(blocked ? null : 2840, blocked ? "unavailable" : "observed", "e_txn"),
      averageTicket: numberValue(blocked ? null : 40.96, blocked ? "unavailable" : "calculated", "e_sales", "calc_average_ticket"),
    },
    opportunitySummary: {
      deterministicMonthlyImpactUsd,
      deterministicAnnualImpactUsd,
      estimatedMonthlyOpportunityUsd,
      estimatedAnnualOpportunityUsd,
      totalEligibleMonthlyOpportunityUsd,
      totalEligibleAnnualOpportunityUsd,
      verificationMonthlyAmountUsd: verification ? 219.4 : 0,
      verificationAnnualizedAmountUsd: verification ? 2632.8 : null,
      currency: "USD",
      annualizationBasis: withOpps || material || verification ? "monthly_charge_times_12" : "none",
      includedFindingIds: findings.filter((finding) => finding.includedInOpportunityTotal).map((finding) => finding.id),
      excludedFindingIds: findings.filter((finding) => !finding.includedInOpportunityTotal).map((finding) => finding.id),
    },
    componentVisibility: visibility,
    verdict: {
      tone: blocked ? "blocked" : low || reconciliationFailure ? "limited" : verification ? "verification" : material ? "negative" : above ? "caution" : "positive",
      eyebrow: statusLabel(state),
      title: stateTitles[state],
      summary:
        state === "healthy"
          ? "RateReveal did not identify a material cost-reduction opportunity in this statement."
          : state === "unable_to_analyze"
            ? "Upload the complete original processor statement so we can verify the core totals."
            : "The report below shows only backend-supported conclusions for this statement.",
      supportingPoints: blocked
        ? ["Core totals were not verified.", "Financial metrics are withheld.", "Try a complete original PDF."]
        : ["Processed sales and total fees were reviewed.", "Opportunity and verification amounts remain separate.", "Evidence is available for supported rows."],
      primaryAction: blocked ? "retry_upload" : verification ? "request_documentation" : material ? "renegotiate" : above ? "compare_quotes" : "monitor",
    },
    benchmark: {
      status: blocked || low ? "unavailable" : above || material ? "above" : "within",
      eligible: !(blocked || low),
      segment: blocked || low ? null : "Professional services",
      lowerRate: blocked || low ? null : 1.85,
      upperRate: blocked || low ? null : 2.45,
      effectiveRate: blocked || low ? null : healthy ? 2.17 : material ? 3.12 : above ? 2.89 : 2.31,
      deltaFromUpperRate: above ? 0.44 : material ? 0.67 : null,
      source:
        blocked || low
          ? null
          : {
              sourceId: "rr_directional_professional_services_2026q3",
              name: "RateReveal internal directional reference",
              version: "2026.07",
              methodologyLabel: "Internal directional benchmark registry",
            },
      confidence: blocked || low ? "low" : "medium",
      omissionReason: blocked || low ? "benchmark_unavailable" : undefined,
    },
    pricingModel: {
      model: blocked || low ? "unknown" : above || material ? "tiered" : "interchange_plus",
      label: blocked || low ? "Pricing model unavailable" : above || material ? "Tiered or bundled pricing" : "Interchange-plus pricing",
      confidence: blocked || low ? "low" : "medium",
      status: blocked || low ? "unknown" : above || material ? "review" : "favorable",
      explanation: blocked || low ? "RateReveal could not confirm the pricing model safely." : above || material ? "The statement shows tiered or bundled pricing indicators that deserve review." : "The statement separates several card-brand costs from processor-controlled fees.",
      observedRates: blocked || low ? [] : [{ label: "Qualified rate", ratePct: healthy ? 1.79 : 2.49, perItemUsd: 0.1, volumeUsd: 40000, transactionCount: 880, confidence: "medium" }],
      evidenceRefs: blocked ? [] : ["e_pricing"],
      recommendation: above || material ? "Request a revised proposal that separates interchange from processor markup." : null,
    },
    feeComposition: {
      status: blocked ? "unavailable" : reconciliationFailure || state === "healthy_with_opportunities" ? "partial" : "available",
      totalFees: blocked ? null : 2526.01,
      rows: feeCompositionRows,
      coveragePct: blocked ? null : reconciliationFailure ? 87.5 : state === "healthy_with_opportunities" ? 93.2 : 99.8,
      deltaUsd: blocked ? null : reconciliationFailure ? 315.9 : state === "healthy_with_opportunities" ? 68.1 : 4.91,
      omissionReason: blocked ? "parser_blocked" : reconciliationFailure ? "reconciliation_failed" : undefined,
    },
    feeInventory: {
      status: blocked ? "unavailable" : state === "healthy_with_opportunities" ? "partial" : "available",
      rows: feeRows,
      observedRowCount: feeRows.length,
      displayedRowCount: feeRows.length,
      omissionReason: blocked ? "parser_blocked" : undefined,
    },
    findings,
    positiveFindings: blocked || low || material || verification ? [] : [
      {
        id: "positive_interchange",
        title: "Card-brand costs were separated clearly",
        explanation: "The statement included enough category detail to review pass-through costs separately from processor-controlled fees.",
        confidence: "medium",
        evidenceRefs: ["e_total_fees"],
      },
    ],
    actionToolkit: {
      primaryAction: "monitor",
      summary: "Deferred in Package 3 UI.",
      prioritizedSteps: [],
      processorQuestions: [],
      negotiationChecklist: [],
      requiredDocuments: [],
      followUpChecks: [],
    },
    details: {
      evidence: [
        {
          id: "e_sales",
          type: "statement_line",
          statementPage: null,
          statementSection: "Summary",
          originalLabel: "Total Amount Submitted",
          excerpt: "Total amount submitted 116,320.55",
          confidence: "high",
        },
        {
          id: "e_total_fees",
          type: "statement_line",
          statementPage: null,
          statementSection: "Fees Charged",
          originalLabel: "Total Fees Charged",
          excerpt: "Total fees charged 2,526.01",
          confidence: "high",
        },
        {
          id: "e_txn",
          type: "statement_line",
          statementPage: null,
          statementSection: "Activity Summary",
          originalLabel: "Transactions",
          excerpt: "Transactions 2,840",
          confidence: "medium",
        },
        {
          id: "e_pricing",
          type: "statement_section",
          statementPage: null,
          statementSection: "Discount Fees",
          originalLabel: "Qualified rate",
          excerpt: "Qualified rate and per-item fees were observed in the statement pricing section.",
          confidence: "medium",
        },
        {
          id: "e_monthly_fee",
          type: "statement_line",
          statementPage: null,
          statementSection: "Service Fees",
          originalLabel: "Monthly Service Charge",
          excerpt: "Monthly Service Charge 39.95",
          confidence: "high",
        },
        {
          id: "e_integrity_fee",
          type: "statement_line",
          statementPage: null,
          statementSection: "Network Fees",
          originalLabel: "Transaction Integrity Fee With A Very Long Label For Wrapping Review",
          excerpt: "Transaction Integrity Fee 219.40",
          confidence: "medium",
        },
      ],
      calculations: [
        {
          id: "calc_effective_rate",
          formulaCode: "fees_divided_by_sales",
          formulaLabel: "Fees as a percentage of sales",
          inputs: [
            { label: "Total fees", value: 2526.01, unit: "money", evidenceRefs: ["e_total_fees"] },
            { label: "Processed sales", value: 116320.55, unit: "money", evidenceRefs: ["e_sales"] },
          ],
          result: healthy ? 2.17 : material ? 3.12 : above ? 2.89 : 2.31,
          unit: "percent",
          assumptions: [],
          confidence: "high",
        },
        {
          id: "calc_average_ticket",
          formulaCode: "sales_divided_by_count",
          formulaLabel: "Average ticket",
          inputs: [
            { label: "Processed sales", value: 116320.55, unit: "money", evidenceRefs: ["e_sales"] },
            { label: "Transactions", value: 2840, unit: "count", evidenceRefs: ["e_txn"] },
          ],
          result: 40.96,
          unit: "money",
          assumptions: [],
          confidence: "medium",
        },
        {
          id: "calc_reconciliation",
          formulaCode: "classified_fee_delta",
          formulaLabel: "Classified fee reconciliation",
          inputs: [
            { label: "Total fees", value: 2526.01, unit: "money", evidenceRefs: ["e_total_fees"] },
            { label: "Classified fees", value: reconciliationFailure ? 2210.11 : 2521.1, unit: "money", evidenceRefs: ["e_total_fees"] },
          ],
          result: reconciliationFailure ? 315.9 : 4.91,
          unit: "money",
          assumptions: [],
          confidence: reconciliationFailure ? "medium" : "high",
        },
        {
          id: "calc_pricing_difference",
          formulaCode: "observed_minus_expected",
          formulaLabel: "Observed processor pricing versus target",
          inputs: [
            { label: "Observed pricing amount", value: 622.34, unit: "money", evidenceRefs: ["e_pricing"] },
            { label: "Expected target amount", value: 438.12, unit: "money", evidenceRefs: [] },
          ],
          result: 184.22,
          unit: "money",
          assumptions: ["Target amount comes from the approved Package 2 comparison target."],
          confidence: "medium",
        },
        {
          id: "calc_monthly_service_difference",
          formulaCode: "observed_minus_expected",
          formulaLabel: "Observed versus expected monthly service fee",
          inputs: [
            { label: "Observed fee", value: 39.95, unit: "money", evidenceRefs: ["e_monthly_fee"] },
            { label: "Expected fee", value: 0, unit: "money", evidenceRefs: [] },
          ],
          result: 39.95,
          unit: "money",
          assumptions: ["Expected amount comes from the approved Package 2 comparison target."],
          confidence: "high",
        },
      ],
    },
    methodology: {
      statementCount: 1,
      benchmarkMethod: "Benchmarks use RateReveal's internal directional registry when a safe segment is available.",
      savingsMethod: "Opportunity totals are supplied by the backend and exclude unknown-cadence and verification-only amounts.",
      reconciliationMethod: "Fee category totals are compared with approved statement total fees before charts are shown.",
      confidenceMethod: "Confidence reflects extraction quality, evidence references, reconciliation, and supported calculations.",
    },
    limitations: [
      {
        code: "single_statement_snapshot",
        message: "This analysis is based on one monthly statement. Future volume, card mix, and processor approval may change outcomes.",
        severity: "info",
        affectedFindingIds: [],
      },
      {
        code: "benchmark_not_available",
        message: "Benchmark references are RateReveal directional references, not independently verified market rates.",
        severity: "warning",
        affectedFindingIds: [],
      },
    ],
  };
}

function visibilityFor(state: ReportStateCode): Record<ReportComponentId, ComponentVisibility> {
  const show = Object.fromEntries(components.map((component) => [component, { status: "show" }])) as Record<ReportComponentId, ComponentVisibility>;
  show.action_toolkit = { status: "hide", reason: "not_applicable", message: "The rich Action Toolkit is deferred from Package 3." };
  if (state === "unable_to_analyze") {
    for (const component of ["core_metrics", "benchmark", "pricing_model", "fee_composition", "fee_inventory", "opportunity_summary", "findings", "positive_findings"] as ReportComponentId[]) {
      show[component] = { status: "hide", reason: "parser_blocked" };
    }
  }
  if (state === "low_confidence") {
    show.benchmark = { status: "hide", reason: "low_confidence" };
    show.opportunity_summary = { status: "hide", reason: "low_confidence" };
    show.findings = { status: "hide", reason: "low_confidence" };
  }
  if (state === "reconciliation_failure") {
    show.benchmark = { status: "hide", reason: "reconciliation_failed" };
    show.fee_composition = { status: "hide", reason: "reconciliation_failed" };
    show.opportunity_summary = { status: "hide", reason: "reconciliation_failed" };
  }
  if (state === "healthy") show.findings = { status: "hide", reason: "no_supported_findings" };
  if (state !== "healthy" && state !== "healthy_with_opportunities" && state !== "above_benchmark_review") {
    show.positive_findings = { status: "hide", reason: "not_applicable" };
  }
  return show;
}

function textValue(value: string | null): ReportValue<string> {
  return {
    value,
    status: value === null ? "unavailable" : "observed",
    confidence: value === null ? null : "medium",
    evidenceRefs: [] as string[],
    unavailableReason: value === null ? "not_extracted" : undefined,
  };
}

function numberValue(value: number | null, status: "observed" | "calculated" | "unavailable", evidenceRef: string, calculationRef?: string): ReportValue<number> {
  return {
    value,
    status,
    confidence: value === null ? null : "high",
    evidenceRefs: value === null ? [] : [evidenceRef],
    calculationRef: status === "calculated" ? calculationRef : undefined,
    unavailableReason: value === null ? "not_extracted" : undefined,
  };
}

function feeRowsFor(state: ReportStateCode) {
  const base = [
    {
      id: "fee_network",
      originalLabel: "Visa Assessment",
      displayLabel: "Visa assessment",
      observedAmountUsd: 418.22,
      cadence: "per_item" as const,
      category: "card_brand_network" as const,
      classificationConfidence: "high" as const,
      classificationExplanation: "Card-brand/network cost identified from the statement fee section.",
      disposition: "none" as const,
      observedRatePct: 0.14,
      observedPerItemUsd: null,
      observedItemCount: null,
      comparisonTargetType: "network_schedule" as const,
      targetRatePct: null,
      targetPerItemUsd: null,
      differenceUsd: null,
      findingId: null,
      evidenceRefs: ["e_total_fees"],
    },
    {
      id: "fee_markup",
      originalLabel: "Processor Discount",
      displayLabel: "Processor discount",
      observedAmountUsd: 622.34,
      cadence: "monthly" as const,
      category: "processor_fees" as const,
      classificationConfidence: "medium" as const,
      classificationExplanation: "Processor-controlled pricing row.",
      disposition: state === "material_overpayment" || state === "above_benchmark_review" ? ("renegotiate" as const) : ("monitor" as const),
      observedRatePct: 0.54,
      observedPerItemUsd: null,
      observedItemCount: null,
      comparisonTargetType: "benchmark" as const,
      targetRatePct: state === "material_overpayment" || state === "above_benchmark_review" ? 0.35 : null,
      targetPerItemUsd: null,
      differenceUsd: state === "material_overpayment" || state === "above_benchmark_review" ? 184.22 : null,
      calculationRef: state === "material_overpayment" || state === "above_benchmark_review" ? "calc_pricing_difference" : undefined,
      findingId: state === "material_overpayment" || state === "above_benchmark_review" ? "finding_pricing" : null,
      evidenceRefs: ["e_pricing"],
    },
    {
      id: "fee_monthly",
      originalLabel: "Monthly Service Charge",
      displayLabel: "Monthly service charge",
      observedAmountUsd: 39.95,
      cadence: "monthly" as const,
      category: "service_compliance" as const,
      classificationConfidence: "high" as const,
      classificationExplanation: "Monthly service fee observed directly on the statement.",
      disposition: state === "healthy" ? ("none" as const) : ("request_removal" as const),
      observedRatePct: null,
      observedPerItemUsd: null,
      observedItemCount: null,
      comparisonTargetType: "negotiation_target" as const,
      targetRatePct: null,
      targetPerItemUsd: null,
      differenceUsd: state === "healthy" ? null : 39.95,
      calculationRef: state === "healthy" ? undefined : "calc_monthly_service_difference",
      findingId: state === "healthy" ? null : "finding_monthly_service",
      evidenceRefs: ["e_monthly_fee"],
    },
    {
      id: "fee_integrity",
      originalLabel: "Transaction Integrity Fee With A Very Long Label For Wrapping Review",
      displayLabel: "Transaction integrity fee with a very long label for wrapping review",
      observedAmountUsd: 219.4,
      cadence: "unknown" as const,
      category: "needs_review" as const,
      classificationConfidence: "medium" as const,
      classificationExplanation: "The fee was observed, but cadence and applicability require processor documentation.",
      disposition: "verify" as const,
      observedRatePct: null,
      observedPerItemUsd: null,
      observedItemCount: null,
      comparisonTargetType: "contract_documentation" as const,
      targetRatePct: null,
      targetPerItemUsd: null,
      differenceUsd: null,
      findingId: state === "verification_required" ? "finding_integrity_verify" : null,
      relatedFindingIds: state === "material_overpayment" ? ["finding_pricing"] : [],
      evidenceRefs: ["e_integrity_fee"],
    },
  ];
  return base;
}

function findingSet(state: ReportStateCode) {
  const estimatedPricingMonthlyImpact = state === "above_benchmark_review" ? 142.5 : 184.22;
  const estimatedPricingAnnualImpact = state === "above_benchmark_review" ? 1710 : 2210.64;
  const pricing = {
    id: "finding_pricing",
    sourceFindingType: "pricing_review",
    category: "pricing",
    disposition: "renegotiate" as const,
    impactClassification: "estimated" as const,
    title: "Processor pricing is above the supported reference range",
    explanation: "The backend identified a supported pricing review based on the observed rate and benchmark status.",
    merchantAction: "Request a revised proposal with transparent interchange-plus pricing.",
    processorQuestion: "Can you provide a revised quote that separates interchange from processor markup?",
    currentMonthlyAmountUsd: 184.22,
    currentAnnualizedAmountUsd: 2210.64,
    cadence: "monthly" as const,
    targetMonthlyAmountUsd: null,
    targetRatePct: 0.35,
    estimatedMonthlyImpactUsd: estimatedPricingMonthlyImpact,
    estimatedAnnualImpactUsd: estimatedPricingAnnualImpact,
    impactLevel: "high" as const,
    easeLevel: "moderate" as const,
    confidence: "medium" as const,
    originalStatementLabels: ["Processor Discount"],
    feeRowIds: ["fee_markup"],
    evidenceRefs: ["e_pricing"],
    calculationRef: "calc_pricing_difference",
    assumptions: ["Estimated opportunity depends on processor approval and future processing mix."],
    limitations: ["The benchmark is a RateReveal directional reference."],
    includedInOpportunityTotal: state !== "verification_required",
    rank: 1,
    overlapRisk: "none" as const,
  };
  const monthly = {
    id: "finding_monthly_service",
    sourceFindingType: "service_fee",
    category: "service_fee",
    disposition: "request_removal" as const,
    impactClassification: "deterministic" as const,
    title: "Monthly service charge is worth challenging",
    explanation: "The fee is a processor-controlled service charge observed directly on the statement.",
    merchantAction: "Ask whether this monthly service charge can be removed.",
    processorQuestion: "Can you remove the monthly service charge from this account?",
    currentMonthlyAmountUsd: 39.95,
    currentAnnualizedAmountUsd: 479.4,
    cadence: "monthly" as const,
    targetMonthlyAmountUsd: 0,
    targetRatePct: null,
    estimatedMonthlyImpactUsd: 39.95,
    estimatedAnnualImpactUsd: 479.4,
    impactLevel: "medium" as const,
    easeLevel: "easy" as const,
    confidence: "high" as const,
    originalStatementLabels: ["Monthly Service Charge"],
    feeRowIds: ["fee_monthly"],
    evidenceRefs: ["e_monthly_fee"],
    calculationRef: "calc_monthly_service_difference",
    assumptions: ["Monthly cadence was approved by backend policy for this fee type."],
    limitations: ["Processor approval is required."],
    includedInOpportunityTotal: state !== "verification_required",
    rank: state === "material_overpayment" || state === "above_benchmark_review" ? 2 : 1,
    overlapRisk: "none" as const,
  };
  const verify = {
    id: "finding_integrity_verify",
    sourceFindingType: "verification_fee",
    category: "network_fee",
    disposition: "verify" as const,
    impactClassification: "verification_only" as const,
    title: "Transaction integrity fee needs documentation",
    explanation: "The charge was observed, but the current statement does not prove it is removable.",
    merchantAction: "Ask the processor to document why this charge applied.",
    processorQuestion: "Can you document the basis for the transaction integrity fee?",
    currentMonthlyAmountUsd: 219.4,
    currentAnnualizedAmountUsd: null,
    cadence: "unknown" as const,
    targetMonthlyAmountUsd: null,
    targetRatePct: null,
    estimatedMonthlyImpactUsd: null,
    estimatedAnnualImpactUsd: null,
    impactLevel: "unknown" as const,
    easeLevel: "unknown" as const,
    confidence: "medium" as const,
    originalStatementLabels: ["Transaction Integrity Fee With A Very Long Label For Wrapping Review"],
    feeRowIds: ["fee_integrity"],
    evidenceRefs: ["e_integrity_fee"],
    assumptions: [],
    limitations: ["Unknown cadence charges are excluded from annual opportunity."],
    includedInOpportunityTotal: false,
    rank: 1,
    overlapRisk: "possible" as const,
  };
  if (state === "verification_required") return [verify];
  if (state === "material_overpayment") return [pricing, monthly, verify];
  if (state === "above_benchmark_review") return [pricing, verify];
  return [monthly, verify];
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
