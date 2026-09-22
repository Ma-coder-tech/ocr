import { isSupportedFiservAnalysis } from "../aiProviderAuthority.js";
import type { AnalysisSummary } from "../types.js";
import type { CanonicalStatementAnalysis, MoneyAmount } from "../canonical/types.js";
import { buildSingleStatementCustomerReport } from "../reporting/buildSingleStatement.js";
import { buildSingleStatementReportV1 } from "../reporting/v1/buildReport.js";
import { toPublicReportSummary } from "../publicReport.js";
import { buildComparisonStatementInput } from "../multiStatementComparisonInput.js";
import { tryEvaluateF4Shadow, type F4ShadowDecision } from "./shadow.js";
import type { PackageECustomerStateAuthorityReadBoundary } from "./packageECustomerStateAuthorityReadBoundary.js";

export type SavingsAuthorityStatus = "supported" | "refused" | "unknown";

export type SavingsAuthoritySourceStream =
  | "legacy_analysis_summary"
  | "generic_benchmark_gap"
  | "generic_component_estimate"
  | "fiserv_component"
  | "fiserv_range_conservative"
  | "fiserv_range_estimated"
  | "fiserv_range_maximum"
  | "customer_report"
  | "report_v1_eligible_opportunity"
  | "report_v1_synthetic_master"
  | "canonical_package_e_eligible"
  | "canonical_package_e_master"
  | "public_api"
  | "persistence"
  | "multi_statement_input_conservative"
  | "multi_statement_input_estimated"
  | "multi_statement_input_maximum";

type EvidenceState = "established" | "partial" | "not_established" | "unknown" | "not_applicable";
type OverlapState = "controlled" | "duplicate_exposure" | "potential_double_count" | "conflicting_calculator" | "unknown" | "not_applicable";

export type SavingsAuthorityComparisonRow = {
  id: string;
  sourceStream: SavingsAuthoritySourceStream;
  amount: MoneyAmount | null;
  positiveClaim: boolean;
  calculationBasis: string;
  claimedCadence: "monthly_annualized" | "annual" | "unknown" | "not_applicable";
  sourceComponent: {
    id: string | null;
    label: string | null;
    feeRowRefs: string[];
  };
  applicablePopulation: string | null;
  counterfactualOrTarget: string | null;
  merchantApplicability: EvidenceState;
  recurrenceEvidence: EvidenceState;
  documentCompletenessEvidence: EvidenceState;
  overlapStatus: OverlapState;
  ownershipActionabilityDependency: "required_not_established" | "not_established" | "not_applicable";
  authority: {
    status: SavingsAuthorityStatus;
    reasonCodes: string[];
    missingAuthorityOrEvidence: string[];
  };
  exposure: {
    customer: boolean;
    api: boolean;
    persistence: boolean;
    multiStatementInput: boolean;
  };
};

export type SupportedFiservSavingsAuthorityComparison = {
  version: "supported_fiserv_savings_authority_comparison_v1";
  standing: "internal_diagnostic_only";
  semanticAuthority: "claim_authority_f4";
  status: "available" | "unavailable" | "not_applicable";
  sourceReportId: string | null;
  supportedFiserv: boolean;
  rows: SavingsAuthorityComparisonRow[];
  packageEInvariant: {
    authorityGatedRowCount: number;
    noPositiveOpportunityLinkage: boolean;
    noApprovedTarget: boolean;
    noEligibleCalculation: boolean;
    eligibleSavings: MoneyAmount;
    masterSavings: MoneyAmount;
    observedAmountsPreserved: boolean;
    verificationOnlyEvidenceReviewPreserved: boolean;
  };
  exposure: {
    publicApiSavingsExposed: boolean;
    persistedLegacySummaryContainsSavings: boolean;
    contributesSavingsInputToMultiStatement: boolean;
    reportV1ProjectionAvailable: boolean;
  };
  comparison: {
    positiveLegacyTopLevel: boolean;
    positiveCustomerReport: boolean;
    positiveFiservRange: boolean;
    positiveReportV1Opportunity: boolean;
    positiveCanonicalPackageE: boolean;
    legacyCalculatorDisagreement: boolean;
    conflictingCalculatorRowIds: string[];
    potentialDoubleCountRowIds: string[];
  };
  summary: {
    rows: number;
    positiveRows: number;
    supported: number;
    refused: number;
    unknown: number;
    supportedPositive: number;
    refusedPositive: number;
    unknownPositive: number;
  };
  limitations: string[];
};

type UnknownRecord = Record<string, unknown>;

const requiredSavingsEvidence = [
  "compatible_fee_identity",
  "authoritative_target_or_counterfactual",
  "merchant_applicability",
  "correct_population_and_denominator",
  "recurrence_and_cadence",
  "document_completeness",
  "deterministic_arithmetic",
  "overlap_control",
  "required_ownership_or_actionability",
  "reviewed_product_policy",
] as const;

export function buildSupportedFiservSavingsAuthorityComparison(input: {
  analysis: CanonicalStatementAnalysis;
  legacySummary: AnalysisSummary | null;
  packageEAuthorityReadBoundary?: PackageECustomerStateAuthorityReadBoundary;
}): SupportedFiservSavingsAuthorityComparison {
  const { analysis, legacySummary } = input;
  if (!legacySummary) return emptyComparison("unavailable", false, analysis);
  if (!isSupportedFiservAnalysis(legacySummary)) return emptyComparison("not_applicable", false, analysis);

  try {
    const shadow = tryEvaluateF4Shadow({ analysis });
    const savingsDecisions = shadow.status === "available"
      ? shadow.report.decisions.filter((decision) => decision.dimension === "savings")
      : [];
    const sourceReportId = shadow.status === "available" ? shadow.report.reportId : null;
    const legacyAuthority = authorityForLegacyPositive(savingsDecisions);
    const rows: SavingsAuthorityComparisonRow[] = [];
    const addLegacy = (row: Omit<SavingsAuthorityComparisonRow, "authority">): void => {
      rows.push({ ...row, authority: authorityForAmount(row.amount, legacyAuthority) });
    };

    addLegacy(legacyRow({
      id: "legacy_analysis_summary_estimated_annual_savings",
      sourceStream: "legacy_analysis_summary",
      amountUsd: legacySummary.estimatedAnnualSavings,
      calculationBasis: "Supported-Fiserv orchestration selects the Fiserv V2 estimated range, with a benchmark-ceiling annualization fallback.",
      cadence: "annual",
      overlapStatus: "conflicting_calculator",
      exposure: { customer: false, api: true, persistence: true, multiStatementInput: true },
    }));

    for (const [index, opportunity] of legacySummary.savingsOpportunities.entries()) {
      const benchmark = /benchmark|reprice blended rate/i.test(`${opportunity.title} ${opportunity.detail}`);
      addLegacy(legacyRow({
        id: `generic_savings_opportunity_${index + 1}`,
        sourceStream: benchmark ? "generic_benchmark_gap" : "generic_component_estimate",
        amountUsd: opportunity.annualSavingsUsd,
        calculationBasis: genericCalculationBasis(opportunity.title, opportunity.detail),
        cadence: "monthly_annualized",
        componentId: `legacy_savings_opportunity_${index + 1}`,
        componentLabel: opportunity.title,
        counterfactualOrTarget: benchmark ? "Legacy benchmark midpoint repricing target." : inferredLegacyCounterfactual(opportunity.title),
        overlapStatus: "potential_double_count",
        ownershipDependency: /processor|markup|negotiat|remove|challenge/i.test(opportunity.title)
          ? "required_not_established" : "not_established",
        exposure: { customer: false, api: false, persistence: true, multiStatementInput: false },
      }));
    }

    const fiserv = record(legacySummary.fiservFeeAnalysisV2);
    const fiservSavings = record(fiserv?.estimatedAnnualSavings);
    const fiservFindings = records(fiserv?.findings);
    for (const [index, component] of records(fiservSavings?.components).entries()) {
      const sourceKind = string(component.sourceFindingKind) ?? string(component.kind);
      const finding = fiservFindings.find((candidate) => string(candidate.kind) === sourceKind) ?? null;
      const impact = record(finding?.componentImpactEstimate);
      addLegacy(legacyRow({
        id: `fiserv_component_${index + 1}`,
        sourceStream: "fiserv_component",
        amountUsd: number(component.annualImpact),
        calculationBasis: string(impact?.basis) ?? `Legacy Fiserv ${string(component.tier) ?? "unclassified"} component-tier annual impact.`,
        cadence: cadenceForFinding(finding),
        componentId: sourceKind,
        componentLabel: string(component.label) ?? string(finding?.title),
        applicablePopulation: populationFromFinding(finding),
        counterfactualOrTarget: targetFromFinding(finding),
        overlapStatus: "potential_double_count",
        ownershipDependency: /markup|processor|negotiat|remov|third.party|service/i.test(`${sourceKind ?? ""} ${string(component.label) ?? ""}`)
          ? "required_not_established" : "not_established",
        exposure: { customer: true, api: true, persistence: true, multiStatementInput: true },
      }));
    }

    for (const [stream, field] of [
      ["fiserv_range_conservative", "conservative"],
      ["fiserv_range_estimated", "estimated"],
      ["fiserv_range_maximum", "maximum"],
    ] as const) {
      addLegacy(legacyRow({
        id: stream,
        sourceStream: stream,
        amountUsd: number(fiservSavings?.[field]),
        calculationBasis: string(fiservSavings?.basis) ?? string(fiservSavings?.methodology) ?? "Legacy Fiserv component-tier sum.",
        cadence: "annual",
        counterfactualOrTarget: "Legacy component-tier targets and removal/repricing assumptions.",
        overlapStatus: "potential_double_count",
        ownershipDependency: "required_not_established",
        exposure: { customer: stream === "fiserv_range_estimated", api: true, persistence: true, multiStatementInput: true },
      }));
    }

    const customerReport = safely(() => buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: legacySummary,
      context: { unlocked: true },
    }));
    addLegacy(legacyRow({
      id: "customer_report_savings",
      sourceStream: "customer_report",
      amountUsd: customerReport.value?.savings.annualAmount ?? null,
      calculationBasis: customerReport.ok
        ? "Sum of visible customer finding annual impacts, falling back to monthly impact multiplied by twelve."
        : `Customer Report savings projection unavailable: ${customerReport.error}`,
      cadence: customerReport.ok ? "annual" : "unknown",
      overlapStatus: "conflicting_calculator",
      ownershipDependency: "required_not_established",
      exposure: { customer: true, api: true, persistence: false, multiStatementInput: false },
    }));

    const reportV1 = safely(() => buildSingleStatementReportV1({
      analysis: legacySummary,
      reportId: "internal_savings_authority_comparison",
      generatedAt: "2000-01-01T00:00:00.000Z",
    }));
    addLegacy(legacyRow({
      id: "report_v1_eligible_opportunity",
      sourceStream: "report_v1_eligible_opportunity",
      amountUsd: reportV1.value?.opportunitySummary.totalEligibleAnnualOpportunityUsd ?? null,
      calculationBasis: reportV1.ok
        ? "Report V1 eligible opportunity aggregation after confidence, cadence, calculation, and overlap filters."
        : `Report V1 projection unavailable: ${reportV1.error}`,
      cadence: reportV1.ok ? "annual" : "unknown",
      overlapStatus: "potential_double_count",
      ownershipDependency: "required_not_established",
      exposure: { customer: true, api: true, persistence: false, multiStatementInput: false },
    }));
    const reportV1Master = reportV1.value?.findings.find((finding) => finding.sourceFindingType === "fiserv_master_estimated_savings") ?? null;
    addLegacy(legacyRow({
      id: "report_v1_synthetic_master",
      sourceStream: "report_v1_synthetic_master",
      amountUsd: reportV1Master?.estimatedAnnualImpactUsd ?? null,
      calculationBasis: reportV1Master
        ? "Synthetic Report V1 master amount derived from the legacy Fiserv estimated savings value."
        : "Synthetic Report V1 master was not present in the projected findings.",
      cadence: reportV1Master ? "monthly_annualized" : "unknown",
      overlapStatus: "duplicate_exposure",
      ownershipDependency: "required_not_established",
      exposure: { customer: true, api: true, persistence: false, multiStatementInput: false },
    }));

    rows.push(canonicalRow(
      "canonical_package_e_eligible",
      "canonical_package_e_eligible",
      analysis.opportunityEngine.summary.totalEligibleAnnualAmount,
      "Canonical Package E total reconstructed only from included eligible components.",
      analysis,
      legacyAuthority,
    ));
    rows.push(canonicalRow(
      "canonical_package_e_master",
      "canonical_package_e_master",
      analysis.opportunityEngine.summary.masterSavingsAnnualAmount,
      "Canonical Package E master savings reconstructed from the eligible component total.",
      analysis,
      legacyAuthority,
    ));

    const publicSummary = toPublicReportSummary(legacySummary);
    addLegacy(legacyRow({
      id: "public_api_estimated_annual_savings",
      sourceStream: "public_api",
      amountUsd: publicSummary?.estimatedAnnualSavings ?? null,
      calculationBasis: "Public summary alias of AnalysisSummary.estimatedAnnualSavings.",
      cadence: "annual",
      overlapStatus: "duplicate_exposure",
      ownershipDependency: "required_not_established",
      exposure: { customer: false, api: true, persistence: false, multiStatementInput: false },
    }));
    addLegacy(legacyRow({
      id: "persisted_analysis_summary_estimated_annual_savings",
      sourceStream: "persistence",
      amountUsd: legacySummary.estimatedAnnualSavings,
      calculationBasis: "AnalysisSummary JSON persisted with the statement record.",
      cadence: "annual",
      overlapStatus: "duplicate_exposure",
      ownershipDependency: "required_not_established",
      exposure: { customer: false, api: true, persistence: true, multiStatementInput: true },
    }));

    const multiStatement = safely(() => buildComparisonStatementInput(legacySummary));
    for (const [stream, field] of [
      ["multi_statement_input_conservative", "conservative"],
      ["multi_statement_input_estimated", "estimated"],
      ["multi_statement_input_maximum", "maximum"],
    ] as const) {
      addLegacy(legacyRow({
        id: stream,
        sourceStream: stream,
        amountUsd: multiStatement.value?.estimatedAnnualSavings[field] ?? null,
        calculationBasis: multiStatement.ok
          ? "Multi-statement comparison input copied from the Fiserv range, with AnalysisSummary fallback."
          : `Multi-statement input unavailable: ${multiStatement.error}`,
        cadence: multiStatement.ok ? "annual" : "unknown",
        overlapStatus: "duplicate_exposure",
        ownershipDependency: "required_not_established",
        exposure: { customer: false, api: false, persistence: true, multiStatementInput: true },
      }));
    }

    const comparison = comparisonSummary(rows);
    const packageEInvariant = packageEInvariantFor(analysis, input.packageEAuthorityReadBoundary);
    return {
      version: "supported_fiserv_savings_authority_comparison_v1",
      standing: "internal_diagnostic_only",
      semanticAuthority: "claim_authority_f4",
      status: shadow.status === "available" ? "available" : "unavailable",
      sourceReportId,
      supportedFiserv: true,
      rows,
      packageEInvariant,
      exposure: {
        publicApiSavingsExposed: (publicSummary?.estimatedAnnualSavings ?? 0) > 0,
        persistedLegacySummaryContainsSavings: legacySummary.estimatedAnnualSavings > 0,
        contributesSavingsInputToMultiStatement: (multiStatement.value?.estimatedAnnualSavings.estimated ?? 0) > 0,
        reportV1ProjectionAvailable: reportV1.ok,
      },
      comparison,
      summary: summarize(rows),
      limitations: [
        "Diagnostic comparison only; it cannot modify canonical analysis, Package E, customer state, reports, APIs, persistence, or multi-statement behavior.",
        "Repository fixture calibration is provisional evidence and is not authenticated Gold authority.",
        "Legacy calculation descriptions document current behavior; they do not admit a counterfactual, target, applicability, recurrence, actionability, or savings claim.",
      ],
    };
  } catch {
    return emptyComparison("unavailable", true, analysis);
  }
}

function legacyRow(input: {
  id: string;
  sourceStream: SavingsAuthoritySourceStream;
  amountUsd: number | null | undefined;
  calculationBasis: string;
  cadence: SavingsAuthorityComparisonRow["claimedCadence"];
  componentId?: string | null;
  componentLabel?: string | null;
  feeRowRefs?: string[];
  applicablePopulation?: string | null;
  counterfactualOrTarget?: string | null;
  overlapStatus: OverlapState;
  ownershipDependency?: SavingsAuthorityComparisonRow["ownershipActionabilityDependency"];
  exposure: SavingsAuthorityComparisonRow["exposure"];
}): Omit<SavingsAuthorityComparisonRow, "authority"> {
  const amount = money(input.amountUsd);
  return {
    id: input.id,
    sourceStream: input.sourceStream,
    amount,
    positiveClaim: (amount?.amountMinor ?? 0) > 0,
    calculationBasis: input.calculationBasis,
    claimedCadence: input.cadence,
    sourceComponent: {
      id: input.componentId ?? null,
      label: input.componentLabel ?? null,
      feeRowRefs: [...(input.feeRowRefs ?? [])],
    },
    applicablePopulation: input.applicablePopulation ?? null,
    counterfactualOrTarget: input.counterfactualOrTarget ?? null,
    merchantApplicability: "not_established",
    recurrenceEvidence: input.cadence === "unknown" ? "unknown" : "not_established",
    documentCompletenessEvidence: "partial",
    overlapStatus: input.overlapStatus,
    ownershipActionabilityDependency: input.ownershipDependency ?? "not_established",
    exposure: input.exposure,
  };
}

function canonicalRow(
  id: string,
  sourceStream: "canonical_package_e_eligible" | "canonical_package_e_master",
  amount: MoneyAmount,
  calculationBasis: string,
  analysis: CanonicalStatementAnalysis,
  savingsAuthority: SavingsAuthorityComparisonRow["authority"],
): SavingsAuthorityComparisonRow {
  const positive = amount.amountMinor > 0;
  const included = analysis.opportunityEngine.components.filter((component) => component.inclusionStatus === "included");
  const canonicalChainAvailable = analysis.validation.status === "valid" && included.length > 0;
  const authority = !positive
    ? {
        status: "supported" as const,
        reasonCodes: ["canonical_package_e_no_positive_claim"],
        missingAuthorityOrEvidence: [],
      }
    : canonicalChainAvailable
      ? clone(savingsAuthority)
      : {
          status: "unknown" as const,
          reasonCodes: ["canonical_package_e_validation_unavailable"],
          missingAuthorityOrEvidence: [...requiredSavingsEvidence],
        };
  return {
    id,
    sourceStream,
    amount: clone(amount),
    positiveClaim: positive,
    calculationBasis,
    claimedCadence: "annual",
    sourceComponent: { id: null, label: null, feeRowRefs: included.flatMap((component) => component.feeRowRefs.map((ref) => ref.feeRowId)) },
    applicablePopulation: positive ? "Canonical Package E included-component population." : null,
    counterfactualOrTarget: positive ? "Canonical Package E approved component targets." : null,
    merchantApplicability: positive ? "established" : "not_applicable",
    recurrenceEvidence: positive ? "established" : "not_applicable",
    documentCompletenessEvidence: positive ? "established" : "not_applicable",
    overlapStatus: positive ? "controlled" : "not_applicable",
    ownershipActionabilityDependency: positive ? "not_established" : "not_applicable",
    authority,
    exposure: { customer: false, api: false, persistence: false, multiStatementInput: false },
  };
}

function authorityForLegacyPositive(decisions: F4ShadowDecision[]): SavingsAuthorityComparisonRow["authority"] {
  const refused = decisions.filter((decision) => decision.status === "refused");
  const supported = decisions.filter((decision) => decision.status === "supported");
  const reasonCodes = unique(decisions.flatMap((decision) => decision.reasonCodes));
  const missing = unique([
    ...decisions.flatMap((decision) => decision.missingGates.map((gate) => `gate:${gate}`)),
    ...decisions.flatMap((decision) => decision.missingFacets.map((facet) => `facet:${facet}`)),
    ...decisions.flatMap((decision) => decision.missingLanes.flat().map((lane) => `authority_lane:${lane}`)),
    ...requiredSavingsEvidence,
  ]);
  if (refused.length > 0) return { status: "refused", reasonCodes, missingAuthorityOrEvidence: missing };
  if (decisions.length > 0 && supported.length === decisions.length)
    return { status: "supported", reasonCodes: ["all_f4_savings_requirements_met"], missingAuthorityOrEvidence: [] };
  return {
    status: "unknown",
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["f4_savings_decision_unavailable"],
    missingAuthorityOrEvidence: missing,
  };
}

function authorityForAmount(
  amount: MoneyAmount | null,
  positiveAuthority: SavingsAuthorityComparisonRow["authority"],
): SavingsAuthorityComparisonRow["authority"] {
  if ((amount?.amountMinor ?? 0) > 0) return clone(positiveAuthority);
  if (amount === null) return {
    status: "unknown",
    reasonCodes: ["savings_stream_unavailable"],
    missingAuthorityOrEvidence: [...requiredSavingsEvidence],
  };
  return {
    status: "unknown",
    reasonCodes: ["no_positive_legacy_amount_but_zero_does_not_prove_no_savings"],
    missingAuthorityOrEvidence: [...requiredSavingsEvidence],
  };
}

function packageEInvariantFor(
  analysis: CanonicalStatementAnalysis,
  readBoundary: PackageECustomerStateAuthorityReadBoundary | undefined,
): SupportedFiservSavingsAuthorityComparison["packageEInvariant"] {
  const gatedRows = readBoundary?.status === "available" ? readBoundary.rows : [];
  const components = gatedRows.flatMap((row) => {
    const component = analysis.opportunityEngine.components.find((candidate) => candidate.id === row.opportunityComponentId);
    return component ? [{ row, component }] : [];
  });
  const gatedFeeRowIds = new Set(gatedRows.map((row) => row.feeRowId));
  const gatedAttention = analysis.merchantAttention.items.filter((item) => item.feeRowIds.some((id) => gatedFeeRowIds.has(id)));
  return {
    authorityGatedRowCount: gatedRows.length,
    noPositiveOpportunityLinkage: components.length === gatedRows.length
      && components.every(({ component }) => component.inclusionStatus !== "included")
      && gatedAttention.every((item) => item.opportunityLink === null),
    noApprovedTarget: components.length === gatedRows.length
      && components.every(({ component }) => component.target.type === "none"),
    noEligibleCalculation: components.length === gatedRows.length
      && components.every(({ component }) => component.calculation.calculationRef === null
      && component.calculation.result === null
      && component.calculation.formulaCode === "none_not_eligible"),
    eligibleSavings: clone(analysis.opportunityEngine.summary.totalEligibleAnnualAmount),
    masterSavings: clone(analysis.opportunityEngine.summary.masterSavingsAnnualAmount),
    observedAmountsPreserved: components.length === gatedRows.length
      && components.every(({ row, component }) => equal(component.observedAmount, row.authorityBacked.observedAmount)
        && equal(component.observedAmount, row.legacyComparison.packageE.observedAmount)),
    verificationOnlyEvidenceReviewPreserved: components.length === gatedRows.length
      && components.every(({ row, component }) => component.eligibility === "verification_only"
        && component.evidenceRefs.length > 0
        && equal(component.evidenceRefs, row.authorityBacked.evidenceRefs)
        && equal(component.evidenceRefs, row.legacyComparison.packageE.evidenceRefs)),
  };
}

function comparisonSummary(rows: SavingsAuthorityComparisonRow[]): SupportedFiservSavingsAuthorityComparison["comparison"] {
  const amount = (id: string) => rows.find((row) => row.id === id)?.amount?.amountMinor ?? 0;
  const primaryIds = [
    "legacy_analysis_summary_estimated_annual_savings",
    "fiserv_range_estimated",
    "customer_report_savings",
    "report_v1_eligible_opportunity",
    "canonical_package_e_eligible",
  ];
  const positive = primaryIds.map((id) => ({ id, amount: amount(id) })).filter((item) => item.amount > 0);
  const uniquePositiveAmounts = new Set(positive.map((item) => item.amount));
  const conflictingCalculatorRowIds = uniquePositiveAmounts.size > 1 ? positive.map((item) => item.id) : [];
  return {
    positiveLegacyTopLevel: amount("legacy_analysis_summary_estimated_annual_savings") > 0,
    positiveCustomerReport: amount("customer_report_savings") > 0,
    positiveFiservRange: amount("fiserv_range_conservative") > 0 || amount("fiserv_range_estimated") > 0 || amount("fiserv_range_maximum") > 0,
    positiveReportV1Opportunity: amount("report_v1_eligible_opportunity") > 0,
    positiveCanonicalPackageE: amount("canonical_package_e_eligible") > 0 || amount("canonical_package_e_master") > 0,
    legacyCalculatorDisagreement: conflictingCalculatorRowIds.length > 0,
    conflictingCalculatorRowIds,
    potentialDoubleCountRowIds: rows.filter((row) => row.positiveClaim && row.overlapStatus === "potential_double_count").map((row) => row.id),
  };
}

function summarize(rows: SavingsAuthorityComparisonRow[]): SupportedFiservSavingsAuthorityComparison["summary"] {
  const positive = rows.filter((row) => row.positiveClaim);
  const count = (status: SavingsAuthorityStatus, source = rows) => source.filter((row) => row.authority.status === status).length;
  return {
    rows: rows.length,
    positiveRows: positive.length,
    supported: count("supported"),
    refused: count("refused"),
    unknown: count("unknown"),
    supportedPositive: count("supported", positive),
    refusedPositive: count("refused", positive),
    unknownPositive: count("unknown", positive),
  };
}

function emptyComparison(
  status: "unavailable" | "not_applicable",
  supportedFiserv: boolean,
  analysis: CanonicalStatementAnalysis,
): SupportedFiservSavingsAuthorityComparison {
  return {
    version: "supported_fiserv_savings_authority_comparison_v1",
    standing: "internal_diagnostic_only",
    semanticAuthority: "claim_authority_f4",
    status,
    sourceReportId: null,
    supportedFiserv,
    rows: [],
    packageEInvariant: packageEInvariantFor(analysis, undefined),
    exposure: {
      publicApiSavingsExposed: false,
      persistedLegacySummaryContainsSavings: false,
      contributesSavingsInputToMultiStatement: false,
      reportV1ProjectionAvailable: false,
    },
    comparison: {
      positiveLegacyTopLevel: false,
      positiveCustomerReport: false,
      positiveFiservRange: false,
      positiveReportV1Opportunity: false,
      positiveCanonicalPackageE: analysis.opportunityEngine.summary.totalEligibleAnnualAmount.amountMinor > 0,
      legacyCalculatorDisagreement: false,
      conflictingCalculatorRowIds: [],
      potentialDoubleCountRowIds: [],
    },
    summary: { rows: 0, positiveRows: 0, supported: 0, refused: 0, unknown: 0, supportedPositive: 0, refusedPositive: 0, unknownPositive: 0 },
    limitations: [status === "not_applicable"
      ? "The legacy summary is not from a supported-Fiserv parser, so this comparison boundary does not apply."
      : "The supported-Fiserv savings comparison could not be completed; live analysis remains unaffected."],
  };
}

function inferredLegacyCounterfactual(title: string): string | null {
  if (/remove|eliminate|cancel/i.test(title)) return "Assumed zero-removal target.";
  if (/reduce|negotiate|challenge/i.test(title)) return "Legacy reduction or negotiation assumption.";
  if (/level 3/i.test(title)) return "Legacy Level 3 optimization model target.";
  return null;
}

function genericCalculationBasis(title: string, detail: string): string {
  if (/reprice blended rate|benchmark/i.test(title))
    return "(estimated monthly volume × (effective rate − benchmark midpoint) × 12) ÷ 100. " + detail;
  if (/ancillary platform/i.test(title))
    return "(observed ancillary-fee pool ÷ observed months) × 12 × assumed 70% reduction. " + detail;
  if (/monthly minimum/i.test(title))
    return "(observed monthly-minimum top-up ÷ observed months) × 12, assuming full removal. " + detail;
  if (/express funding/i.test(title))
    return "(observed express-funding premium ÷ observed months) × 12, assuming full reduction. " + detail;
  if (/savings.share/i.test(title))
    return "(observed retained savings-share amount ÷ observed months) × 12, assuming full recovery. " + detail;
  if (/level 3/i.test(title))
    return "Legacy Level 3 estimated monthly savings × 12. " + detail;
  if (/processor markup|dominant fee bucket/i.test(title))
    return "(largest matching fee bucket ÷ observed months) × 12 × assumed 20% reduction. " + detail;
  return detail;
}

function targetFromFinding(finding: UnknownRecord | null): string | null {
  if (!finding) return null;
  const impact = record(finding.componentImpactEstimate);
  return string(impact?.basis) ?? string(finding.action);
}

function populationFromFinding(finding: UnknownRecord | null): string | null {
  if (!finding) return null;
  const evidence = Array.isArray(finding.evidence) ? finding.evidence.filter((item): item is string => typeof item === "string") : [];
  return evidence.find((item) => /transaction|volume|authorization|item|service|fee/i.test(item)) ?? null;
}

function cadenceForFinding(finding: UnknownRecord | null): SavingsAuthorityComparisonRow["claimedCadence"] {
  if (!finding) return "unknown";
  if (number(finding.monthlyCost) !== null) return "monthly_annualized";
  const impact = record(finding.componentImpactEstimate);
  if (/annualiz|monthly|this month|× 12|times 12/i.test(string(impact?.basis) ?? "")) return "monthly_annualized";
  if (number(finding.annualEstimate) !== null || impact) return "annual";
  return "unknown";
}

function safely<T>(fn: () => T): { ok: true; value: T; error: null } | { ok: false; value: null; error: string } {
  try {
    return { ok: true, value: fn(), error: null };
  } catch (error) {
    return { ok: false, value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function money(value: number | null | undefined): MoneyAmount | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return { amountMinor: Math.round(value * 100), currency: "USD" };
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is UnknownRecord => item !== null) : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
