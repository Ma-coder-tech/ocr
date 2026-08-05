import { CUSTOMER_PERMISSION_KEYS } from "./customerStateTypes.js";
import { targetSupportsApprovedEstimate, targetSupportsDeterministic } from "./opportunityPolicy.js";
import {
  canonicalProjectionLimitation,
  customerLimitationsFor,
  hasLimitation,
  validateCanonicalProjectionLimitations,
} from "./customerReportProjectionLimitations.js";
import {
  containsForbiddenCustomerProjectionContent,
  validateCanonicalCustomerReportProjection,
} from "./customerReportProjectionValidation.js";
import {
  CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS,
  CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION,
  type BenchmarkProjection,
  type CanonicalCustomerReportProjectionBuildOptions,
  type CanonicalCustomerReportProjectionV1,
  type CanonicalProjectionLimitationRecord,
  type CoreMetricsProjection,
  type CustomerActionProjection,
  type CustomerFeeRowProjection,
  type CustomerMoney,
  type CustomerOpportunityItem,
  type CustomerPermissionProjection,
  type CustomerPercent,
  type CustomerSectionLimitationCode,
  type EffectiveRateProjection,
  type FeeInventoryProjection,
  type OpportunityProjection,
  type VerificationProjection,
} from "./customerReportProjectionTypes.js";
import type {
  CanonicalCustomerActionGuidance,
  CanonicalCustomerAxisProjection,
  CanonicalCustomerPermissionDecision,
  CanonicalCustomerPrimaryState,
  CanonicalFeeDocumentationRequirement,
  CanonicalFeeRow,
  CanonicalOpportunityComponent,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "./types.js";

const SUPPORTED_FISERV_FAMILY_IDENTITIES = new Set([
  "fiserv",
  "fiserv first data",
  "fiserv family",
  "fiserv clover",
]);

const APPROVED_DIRECT_PROCESSOR_LABELS = new Map([
  ["fiserv", "Fiserv"],
  ["first data", "First Data"],
  ["fiserv first data", "Fiserv / First Data"],
  ["clover", "Clover"],
]);

type SupportedOpportunityProjection = {
  component: CanonicalOpportunityComponent;
  removabilityLevel: "conditionally_removable" | "potentially_negotiable";
  supportedAction: "request_removal" | "request_repricing";
};

export function buildCanonicalCustomerReportProjection(
  analysis: CanonicalStatementAnalysis,
  options: CanonicalCustomerReportProjectionBuildOptions,
): CanonicalCustomerReportProjectionV1 {
  if (options?.purpose !== "synthetic_fixture_validation_only") {
    throw new Error("canonical_customer_projection_synthetic_fixture_purpose_required");
  }

  const suppliedRecords = options.limitationRecords ?? [];
  const suppliedErrors = validateCanonicalProjectionLimitations(suppliedRecords);
  if (suppliedErrors.length > 0) {
    throw new Error(`canonical_customer_projection_limitation_invalid:${suppliedErrors.join(",")}`);
  }

  const records = mergeLimitationRecords(deriveLimitationRecords(analysis), suppliedRecords);
  const limitationErrors = validateCanonicalProjectionLimitations(records);
  if (limitationErrors.length > 0) {
    throw new Error(`canonical_customer_projection_limitation_invalid:${limitationErrors.join(",")}`);
  }

  const blockingCodes = records
    .filter((record) => record.severity === "blocked" && record.affectedSections.includes("projection"))
    .map((record) => record.code)
    .sort();
  if (blockingCodes.length > 0) {
    throw new Error(`canonical_customer_projection_withheld:${blockingCodes.join(",")}`);
  }

  const state = analysis.customerState;
  const hideNarrative = hasLimitation(records, "narrative_content_unsafe");
  const hideOpportunities = hasLimitation(records, "opportunity_support_unavailable");
  const feeReconciliationLimited = hasLimitation(records, "fee_reconciliation_incomplete");
  const feeContentLimited = hasLimitation(records, "fee_section_content_unsafe");
  const benchmarkUnavailable = hasLimitation(records, "benchmark_unavailable");
  const supportedOpportunities = hideOpportunities ? [] : supportedOpportunityComponents(analysis, benchmarkUnavailable);
  const visibleOpportunities = visibleOpportunityComponents(analysis, supportedOpportunities);
  const opportunityProjection = opportunitiesFor(analysis, visibleOpportunities, { hideOpportunities });
  const projectedState = projectedPrimaryState(analysis, { hideOpportunities, benchmarkUnavailable });
  const projectedAxes = projectedAxisState(analysis, projectedState, benchmarkUnavailable);
  const permissions = projectPermissions(state.permissions);
  const explanation = explanationFor(analysis, hideNarrative);
  const feeInventory = feeInventoryFor(analysis, {
    reconciliationLimited: feeReconciliationLimited,
    contentLimited: feeContentLimited,
  });
  const benchmark = benchmarkFor(analysis, benchmarkUnavailable);
  const actions = actionsFor(analysis, opportunityProjection, visibleOpportunities, hideOpportunities);
  const coreMetrics = coreMetricsFor(analysis);
  const effectiveRate = effectiveRateFor(analysis);
  const verificationItems = verificationFor(analysis);
  const visibility = {
    coreMetrics: coreMetrics.status,
    effectiveRate: effectiveRate.status,
    benchmark: benchmark.status,
    feeInventory: feeInventory.status,
    opportunities: opportunityProjection.status,
    verificationItems: verificationItems.status,
    actions: actions.length > 0 ? "shown" : "hidden",
    explanation: explanation.status,
  } as const;

  const projection: CanonicalCustomerReportProjectionV1 = {
    reportVersion: CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION,
    projectionReadiness: CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS,
    source: "synthetic_fixture",
    displayId: "preview-analysis",
    primaryState: projectedState,
    axes: projectedAxes,
    permissions,
    visibility,
    headline: headlineFor(projectedState, { benchmarkUnavailable, hideOpportunities }),
    statementSummary: {
      processor: processorLabel(analysis)!,
      statementPeriod: periodLabel(analysis.identity.statementPeriod.value!),
      businessType: "Business type verified",
    },
    coreMetrics,
    effectiveRate,
    benchmark,
    feeInventory,
    opportunities: opportunityProjection,
    verificationItems,
    limitations: customerLimitationsFor(records),
    actions,
    explanation,
    methodology: {
      dataQuality: projectedAxes.analysisReadiness,
      guidance: methodologyGuidance(projectedState),
      docsToGather: docsToGather(projectedState),
    },
  };

  const validation = validateCanonicalCustomerReportProjection(projection);
  if (validation.status !== "valid") {
    throw new Error(`canonical_customer_projection_invalid:${validation.errors.join(",")}`);
  }
  return projection;
}

function deriveLimitationRecords(analysis: CanonicalStatementAnalysis): CanonicalProjectionLimitationRecord[] {
  const records: CanonicalProjectionLimitationRecord[] = [];
  if (!coreFactsAreSafe(analysis)) records.push(canonicalProjectionLimitation("core_facts_unsafe"));
  if (!identityIsSafe(analysis)) records.push(canonicalProjectionLimitation("identity_unsafe"));
  if (!coreReconciles(analysis)) records.push(canonicalProjectionLimitation("core_reconciliation_missing"));

  if (
    analysis.customerState.explanation.prohibitedLanguageCheck !== "passed" ||
    analysis.customerState.explanation.sections.some((section) => containsForbiddenCustomerProjectionContent(section.text))
  ) {
    records.push(canonicalProjectionLimitation("narrative_content_unsafe"));
  }

  const unresolvedRowCount = analysis.feeLedger.rows.filter(
    (row) => row.role === "unknown_unresolved" || row.limitations.length > 0,
  ).length;
  if (
    analysis.feeLedger.status !== "available" ||
    analysis.feeLedger.controls.some((control) => !["pass", "pass_with_rounding"].includes(control.status))
  ) {
    records.push(canonicalProjectionLimitation("fee_reconciliation_incomplete", { unresolvedRowCount }));
  }
  if (analysis.feeLedger.rows.some((row) => !feeLabelIsSafe(row.selectedLabel))) {
    records.push(canonicalProjectionLimitation("fee_section_content_unsafe"));
  }

  const benchmarkUnavailable =
    analysis.customerState.rateComparison.status !== "qualified" ||
    analysis.customerState.rateComparison.position === "unavailable" ||
    analysis.customerState.axes.ratePosition === "unavailable";
  if (benchmarkUnavailable) records.push(canonicalProjectionLimitation("benchmark_unavailable"));

  const visibleOpportunityRequested =
    analysis.customerState.visibility.showDeterministicOpportunity || analysis.customerState.visibility.showEstimatedOpportunity;
  if (visibleOpportunityRequested && supportedOpportunityComponents(analysis, benchmarkUnavailable).length === 0) {
    records.push(canonicalProjectionLimitation("opportunity_support_unavailable"));
  }

  if (
    analysis.customerState.limitations.length > 0 ||
    analysis.feeLedger.limitations.length > 0 ||
    analysis.opportunityEngine.limitations.length > 0
  ) {
    records.push(canonicalProjectionLimitation("internal_runtime_detail"));
  }
  return records;
}

function mergeLimitationRecords(
  derived: readonly CanonicalProjectionLimitationRecord[],
  supplied: readonly CanonicalProjectionLimitationRecord[],
): CanonicalProjectionLimitationRecord[] {
  const records = new Map<string, CanonicalProjectionLimitationRecord>();
  for (const record of [...derived, ...supplied]) {
    const existing = records.get(record.code);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      return [...records.values(), record];
    }
    records.set(record.code, record);
  }
  return [...records.values()];
}

function projectPermissions(permissions: CanonicalCustomerPermissionDecision[]): CustomerPermissionProjection {
  const lookup = new Map(permissions.map((permission) => [permission.key, permission]));
  return Object.fromEntries(
    CUSTOMER_PERMISSION_KEYS.map((key) => [
      key,
      {
        permitted: lookup.get(key)?.permitted === true,
        reasonCodes: [lookup.get(key)?.permitted === true ? "section_permitted" : "section_unavailable"],
      },
    ]),
  ) as CustomerPermissionProjection;
}

function coreMetricsFor(analysis: CanonicalStatementAnalysis): CoreMetricsProjection {
  if (!analysis.customerState.visibility.showCoreMetrics || !permissionPermitted(analysis, "core_metrics")) {
    return { status: "hidden", reasonCode: "core_metrics_hidden" };
  }
  return {
    status: "shown",
    processedVolume: money(analysis.financialFacts.processedSales.value),
    totalFees: money(analysis.financialFacts.totalFees.value),
    transactionCount: { status: "unavailable", reasonCode: "transaction_population_not_safe" },
    averageTicket: { status: "unavailable", reasonCode: "average_ticket_unavailable" },
  };
}

function effectiveRateFor(analysis: CanonicalStatementAnalysis): EffectiveRateProjection {
  if (!analysis.customerState.visibility.showEffectiveRate || !permissionPermitted(analysis, "effective_rate")) {
    return analysis.customerState.axes.analysisReadiness === "unavailable"
      ? { status: "hidden", reasonCode: "effective_rate_hidden" }
      : { status: "unavailable", reasonCode: "effective_rate_unavailable" };
  }
  return {
    status: "shown",
    rate: percent(analysis.financialFacts.rateRevealCalculatedAllInRate.value!),
    basisLabel: "All-in processing fees divided by verified processing volume",
    limitationCodes: analysis.financialFacts.effectiveRateBasis.populationCompatibility === "compatible" ? [] : ["rate_basis_limited"],
  };
}

function benchmarkFor(analysis: CanonicalStatementAnalysis, unavailable: boolean): BenchmarkProjection {
  const { rateComparison, visibility } = analysis.customerState;
  if (unavailable) {
    return {
      status: "unavailable",
      reasonCode: "rate_comparison_unavailable",
      customerMessage: "A rate comparison is not available for this statement yet.",
    };
  }
  if (!visibility.showBenchmark || !permissionPermitted(analysis, "benchmark")) return { status: "hidden", reasonCode: "benchmark_hidden" };
  if (rateComparison.status !== "qualified" || rateComparison.position === "unavailable") {
    return {
      status: "unavailable",
      reasonCode: "rate_comparison_unavailable",
      customerMessage: "A rate comparison is not available for this statement yet.",
    };
  }
  return {
    status: "shown",
    position: rateComparison.position,
    rangeLabel: "Matched reference range",
    methodologyLabel: "Matched processing and business context",
    limitationCodes: [],
  };
}

function feeInventoryFor(
  analysis: CanonicalStatementAnalysis,
  decisions: { reconciliationLimited: boolean; contentLimited: boolean },
): FeeInventoryProjection {
  if (!analysis.customerState.visibility.showFeeInventory || !permissionPermitted(analysis, "fee_inventory")) {
    return { status: "hidden", reasonCode: "fee_inventory_hidden" };
  }
  const limited = decisions.reconciliationLimited || decisions.contentLimited;
  const safeRows = analysis.feeLedger.rows.filter((row) => feeLabelIsSafe(row.selectedLabel));
  const rows = safeRows.slice(0, 12).map(projectFeeRow);
  const limitationCodes: CustomerSectionLimitationCode[] = [];
  if (decisions.reconciliationLimited) limitationCodes.push("fee_reconciliation_incomplete");
  if (decisions.contentLimited) limitationCodes.push("fee_section_content_unsafe");
  return {
    status: limited ? "limited" : "shown",
    totalVisibleAmount: limited ? null : analysis.feeLedger.uniqueChargeTotal ? money(analysis.feeLedger.uniqueChargeTotal) : null,
    rows,
    omittedRowCount: Math.max(0, analysis.feeLedger.rows.length - rows.length),
    limitationCodes,
  };
}

function opportunitiesFor(
  analysis: CanonicalStatementAnalysis,
  components: SupportedOpportunityProjection[],
  decisions: { hideOpportunities: boolean },
): OpportunityProjection {
  const { visibility } = analysis.customerState;
  if (decisions.hideOpportunities) return { status: "hidden", reasonCode: "eligible_opportunity_hidden" };
  const deterministicPermitted = visibility.showDeterministicOpportunity && permissionPermitted(analysis, "deterministic_opportunity");
  const estimatedPermitted = visibility.showEstimatedOpportunity && permissionPermitted(analysis, "estimated_opportunity");
  if (!deterministicPermitted && !estimatedPermitted) {
    return analysis.customerState.axes.opportunityPosture === "none"
      ? { status: "none", reasonCode: "no_eligible_opportunity_found" }
      : { status: "hidden", reasonCode: "eligible_opportunity_hidden" };
  }

  if (components.length === 0) return { status: "hidden", reasonCode: "eligible_opportunity_hidden" };
  const items = components.map((supportedOpportunity, index) => projectOpportunity(supportedOpportunity, index));
  return {
    status: "shown",
    deterministicAmount: deterministicPermitted ? totalFor(components, "deterministic") : null,
    estimatedAmount: estimatedPermitted ? totalFor(components, "approved_estimate") : null,
    items,
    limitationCodes: [],
  };
}

function visibleOpportunityComponents(
  analysis: CanonicalStatementAnalysis,
  supported: SupportedOpportunityProjection[],
): SupportedOpportunityProjection[] {
  const deterministicPermitted =
    analysis.customerState.visibility.showDeterministicOpportunity && permissionPermitted(analysis, "deterministic_opportunity");
  const estimatedPermitted =
    analysis.customerState.visibility.showEstimatedOpportunity && permissionPermitted(analysis, "estimated_opportunity");
  return supported
    .filter(({ component }) => component.eligibility === "deterministic" ? deterministicPermitted : estimatedPermitted)
    .slice(0, 6);
}

function supportedOpportunityComponents(
  analysis: CanonicalStatementAnalysis,
  benchmarkUnavailable: boolean,
): SupportedOpportunityProjection[] {
  const evidenceIds = new Set(analysis.evidence.map((evidence) => evidence.id));
  const calculationIds = new Set(analysis.calculations.map((calculation) => calculation.id));
  const classifications = new Map(
    analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification]),
  );
  return analysis.opportunityEngine.components.flatMap((component): SupportedOpportunityProjection[] => {
    if (component.inclusionStatus !== "included") return [];
    if (component.eligibility !== "deterministic" && component.eligibility !== "approved_estimate") return [];
    if (component.target.type === "none" || !component.targetProvenance.opportunityApproved) return [];
    if (benchmarkUnavailable && (component.kind === "rate_repricing" || component.targetProvenance.sourceType === "benchmark_registry")) return [];
    if (
      !component.calculation.result ||
      component.calculation.result.amountMinor <= 0 ||
      component.calculation.result.currency !== "USD"
    ) return [];
    if (
      component.calculation.formulaCode === "none_not_eligible" ||
      component.calculation.formulaCode === "opportunity_component_sum" ||
      !component.calculation.annualized ||
      component.calculation.aiSourced !== false ||
      component.calculation.calculationRef === null ||
      !calculationIds.has(component.calculation.calculationRef)
    ) return [];
    if (
      !component.cadence.proven ||
      !component.cadence.annualizationAllowed ||
      component.cadence.value === "unknown" ||
      component.cadence.value === "one_time" ||
      component.cadence.frequencyPerYear === null ||
      component.cadence.frequencyPerYear <= 0 ||
      component.cadence.proof === "not_proven" ||
      component.cadence.aiSourced !== false
    ) return [];
    if (
      component.evidenceRefs.length === 0 ||
      component.targetProvenance.evidenceRefs.length === 0 ||
      component.cadence.evidenceRefs.length === 0 ||
      component.calculation.evidenceRefs.length === 0 ||
      !allEvidenceExists(component, evidenceIds)
    ) return [];
    if (
      component.actionabilityCeiling !== "potentially_actionable" ||
      component.ownership.contractualController !== "processor" ||
      component.confidence === "low" ||
      component.target.aiSourced !== false ||
      component.targetProvenance.aiSourced !== false ||
      component.observedAmount?.aiSourced !== false
    ) return [];
    if (component.overlap.resolution === "requires_review") return [];
    if (
      component.inclusionReasonCodes.length === 0 ||
      component.exclusionReasonCodes.length > 0 ||
      component.limitations.length > 0 ||
      component.targetProvenance.limitations.length > 0
    ) return [];
    if (component.eligibility === "deterministic" && !targetSupportsDeterministic(component.targetProvenance, component.target)) return [];
    if (component.eligibility === "approved_estimate" && !targetSupportsApprovedEstimate(component.targetProvenance, component.target)) return [];
    if (component.feeRowRefs.length === 0 || component.feeRowRefs.some((ref) => {
      const classification = classifications.get(ref.feeRowId);
      const candidate = classification?.candidates.find((item) => item.id === ref.classificationCandidateId);
      const row = analysis.feeLedger.rows.find((item) => item.id === ref.feeRowId);
      return (
        !row ||
        !row.contributesToUniqueTotal ||
        !row.selectedAmount ||
        row.selectedAmount.amountMinor <= 0 ||
        !classification ||
        !candidate ||
        classification.selected.candidateId !== ref.classificationCandidateId ||
        classification.conflictStatus === "unresolved" ||
        classification.conflictStatus === "requires_human_review" ||
        classification.selected.actionabilityCeiling !== "potentially_actionable" ||
        !documentationAllowsOpportunityPublication(classification.selected.documentationRequirement) ||
        classification.selected.confidence !== "high" ||
        classification.selected.ownership.contractualController !== "processor" ||
        !candidate.authoritative ||
        candidate.sourceType === "ai_suggestion" ||
        !documentationAllowsOpportunityPublication(candidate.documentationRequirement) ||
        candidate.evidenceRefs.length === 0 ||
        candidate.evidenceRefs.some((evidenceRef) => !evidenceIds.has(evidenceRef))
      );
    })) return [];

    const claim = supportedClaimFor(component, evidenceIds);
    return claim ? [{ component, ...claim }] : [];
  });
}

function supportedClaimFor(
  component: CanonicalOpportunityComponent,
  evidenceIds: ReadonlySet<string>,
): Omit<SupportedOpportunityProjection, "component"> | null {
  if (component.kind === "fee_removal") {
    if (
      component.target.type !== "zero_removal" ||
      component.target.proofEvidenceRefs.length === 0 ||
      component.target.proofEvidenceRefs.some((ref) => !evidenceIds.has(ref))
    ) return null;
    return { removabilityLevel: "conditionally_removable", supportedAction: "request_removal" };
  }
  if (component.kind === "rate_repricing") {
    if (component.target.type !== "rate" && component.target.type !== "model_rate") return null;
    return { removabilityLevel: "potentially_negotiable", supportedAction: "request_repricing" };
  }
  if (component.kind === "per_item_repricing") {
    if (component.target.type !== "per_item" && component.target.type !== "model_per_item") return null;
    return { removabilityLevel: "potentially_negotiable", supportedAction: "request_repricing" };
  }
  return null;
}

function allEvidenceExists(component: CanonicalOpportunityComponent, evidenceIds: ReadonlySet<string>): boolean {
  const refs = [
    ...component.evidenceRefs,
    ...component.targetProvenance.evidenceRefs,
    ...component.cadence.evidenceRefs,
    ...component.calculation.evidenceRefs,
    ...(component.observedAmount?.evidenceRefs ?? []),
  ];
  return refs.every((ref) => evidenceIds.has(ref));
}

function projectOpportunity(supported: SupportedOpportunityProjection, index: number): CustomerOpportunityItem {
  const { component } = supported;
  return {
    displayId: `preview-opportunity-${index + 1}`,
    title: component.kind === "fee_removal" ? "Fee removal opportunity" : "Pricing review opportunity",
    amount: money(component.calculation.result),
    certainty: component.eligibility === "deterministic" ? "verified" : "estimated",
    removabilityLevel: supported.removabilityLevel,
    evidenceStatus: component.eligibility === "deterministic" ? "verified" : "supported_by_synthetic_source",
    source: syntheticSource("Example processing pricing addendum"),
    conditions: ["Confirm the applicable terms before acting."],
    cadence: component.cadence.value === "annual" ? "annual" : component.cadence.value === "monthly" ? "monthly" : "statement_frequency",
    supportedAction: supported.supportedAction,
    reasonCodes: ["supported_opportunity"],
  };
}

function totalFor(components: SupportedOpportunityProjection[], eligibility: "deterministic" | "approved_estimate"): CustomerMoney | null {
  const matching = components.filter(({ component }) => component.eligibility === eligibility);
  if (matching.length === 0) return null;
  return {
    amountMinor: matching.reduce((total, { component }) => total + (component.calculation.result?.amountMinor ?? 0), 0),
    currency: "USD",
  };
}

function verificationFor(analysis: CanonicalStatementAnalysis): VerificationProjection {
  if (!analysis.customerState.visibility.showVerificationAmounts || !permissionPermitted(analysis, "verification_amounts")) {
    return analysis.customerState.axes.opportunityPosture === "verification_only"
      ? { status: "hidden", reasonCode: "verification_hidden" }
      : { status: "none", reasonCode: "no_verification_amounts" };
  }
  return {
    status: "shown",
    observedAmount: money(analysis.customerState.visibility.visibleVerificationOnlyObservedAmount),
    label: "Amount to verify",
    items: [
      {
        displayId: "preview-verification-1",
        title: "Fee needs documentation",
        observedAmount: money(analysis.customerState.visibility.visibleVerificationOnlyObservedAmount),
        evidenceStatus: "needs_verification",
        source: syntheticSource("Example processing statement note"),
        conditions: ["Request documentation before treating this amount as savings."],
        reasonCodes: ["documentation_needed"],
      },
    ],
    notSavingsCopy: "This is not treated as savings until documentation supports it.",
    limitationCodes: ["documentation_needed"],
  };
}

function projectFeeRow(row: CanonicalFeeRow, index: number): CustomerFeeRowProjection {
  const unresolved = row.role === "unknown_unresolved";
  return {
    displayId: `preview-fee-${index + 1}`,
    label: row.selectedLabel.trim(),
    amount: row.selectedAmount ? money(row.selectedAmount) : null,
    role: row.role === "credit" ? "credit" : row.contributesToUniqueTotal ? (row.role === "interchange_detail_row" ? "pass_through" : "charge") : unresolved ? "unresolved" : "excluded",
    feeOwner: row.role === "interchange_detail_row" ? "card_network" : unresolved ? "needs_review" : "processor",
    customerCategory: "needs_review",
    actionability: "needs_review",
    removabilityLevel: unresolved ? "needs_verification" : "not_applicable",
    evidenceStatus: row.contributionDecision.confidence === "high" ? "verified" : "needs_verification",
    source: row.role === "interchange_detail_row" ? syntheticSource("Example card-network fee schedule") : null,
    conditions: unresolved ? ["Verify this fee before considering an action."] : [],
    status: row.contributesToUniqueTotal ? "included" : unresolved ? "unresolved" : "excluded",
    limitationCodes: unresolved ? ["fee_requires_review"] : [],
  };
}

function actionsFor(
  analysis: CanonicalStatementAnalysis,
  opportunities: OpportunityProjection,
  supportedOpportunities: SupportedOpportunityProjection[],
  hideOpportunities: boolean,
): CustomerActionProjection[] {
  if (
    hideOpportunities ||
    opportunities.status !== "shown" ||
    !analysis.customerState.visibility.showActions ||
    !permissionPermitted(analysis, "actions")
  ) return [];
  const admitted = new Map(supportedOpportunities.map((item, index) => [item.component.id, { ...item, displayId: `preview-opportunity-${index + 1}` }]));
  return analysis.customerState.actionGuidance
    .filter((action) => actionIsSupported(action, analysis, admitted))
    .slice(0, 4)
    .map((action, index) => projectAction(action, index, admitted));
}

function actionIsSupported(
  action: CanonicalCustomerActionGuidance,
  analysis: CanonicalStatementAnalysis,
  admitted: ReadonlyMap<string, SupportedOpportunityProjection & { displayId: string }>,
): boolean {
  if (
    action.opportunityComponentRefs.length === 0 ||
    action.evidenceRefs.length === 0 ||
    action.evidenceRefs.some((ref) => !analysis.evidence.some((evidence) => evidence.id === ref)) ||
    action.calculationRefs.length === 0 ||
    action.calculationRefs.some((ref) => !analysis.calculations.some((calculation) => calculation.id === ref)) ||
    action.confidence === "low" ||
    action.limitationCodes.length > 0
  ) return false;
  const opportunities = action.opportunityComponentRefs.map((ref) => admitted.get(ref));
  if (opportunities.some((opportunity) => opportunity === undefined)) return false;
  if (action.actionType === "request_removal" || action.actionType === "request_repricing") {
    if (!documentationAllowsOpportunityPublication(action.documentationRequirement)) return false;
    return opportunities.every((opportunity) => opportunity?.supportedAction === action.actionType);
  }
  if (action.documentationRequirement === "blocking") return false;
  return true;
}

function documentationAllowsOpportunityPublication(requirement: CanonicalFeeDocumentationRequirement): boolean {
  return requirement === "none" || requirement === "recommended";
}

function explanationFor(analysis: CanonicalStatementAnalysis, hidden: boolean): CanonicalCustomerReportProjectionV1["explanation"] {
  const visible =
    analysis.customerState.visibility.showCustomerExplanation &&
    permissionPermitted(analysis, "customer_explanation") &&
    !hidden;
  if (!visible) {
    return {
      status: hidden || analysis.customerState.axes.explanationReadiness !== "unavailable" ? "hidden" : "unavailable",
      source: "unavailable",
      sections: [],
      fallbackReasonCodes: [hidden ? "explanation_content_unavailable" : "explanation_unavailable"],
    };
  }
  const kinds = [...new Set(analysis.customerState.explanation.sections.map((section) => section.kind))].slice(0, 5);
  return {
    status: "shown",
    source: analysis.customerState.explanation.source,
    sections: (kinds.length > 0 ? kinds : ["summary"]).map((kind) => ({
      title: sectionTitle(kind),
      body: approvedExplanationBody(kind),
    })),
    fallbackReasonCodes: ["customer_explanation_available"],
  };
}

function projectAction(
  action: CanonicalCustomerActionGuidance,
  index: number,
  admitted: ReadonlyMap<string, SupportedOpportunityProjection & { displayId: string }>,
): CustomerActionProjection {
  const copy = actionCopy(action.actionType);
  return {
    displayId: `preview-action-${index + 1}`,
    type: action.actionType,
    label: copy.label,
    body: copy.body,
    targetDisplayIds: action.opportunityComponentRefs.flatMap((ref) => admitted.get(ref)?.displayId ?? []),
    reasonCodes: ["supported_action"],
  };
}

function coreFactsAreSafe(analysis: CanonicalStatementAnalysis): boolean {
  const sales = analysis.financialFacts.processedSales;
  const fees = analysis.financialFacts.totalFees;
  return (
    sales.status === "selected" &&
    sales.value !== null &&
    sales.value.amountMinor > 0 &&
    sales.value.currency === "USD" &&
    fees.status === "selected" &&
    fees.value !== null &&
    fees.value.amountMinor >= 0 &&
    fees.value.currency === "USD"
  );
}

function identityIsSafe(analysis: CanonicalStatementAnalysis): boolean {
  const processor = processorLabel(analysis);
  const period = analysis.identity.statementPeriod;
  const businessType = analysis.identity.businessType;
  return (
    processor !== null &&
    period.status === "selected" &&
    period.value !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(period.value.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(period.value.end) &&
    businessType.status === "selected" &&
    typeof businessType.value === "string" &&
    businessType.value.length > 0 &&
    !containsForbiddenCustomerProjectionContent(businessType.value)
  );
}

function coreReconciles(analysis: CanonicalStatementAnalysis): boolean {
  if (!coreFactsAreSafe(analysis)) return false;
  const rate = analysis.financialFacts.rateRevealCalculatedAllInRate;
  const basis = analysis.financialFacts.effectiveRateBasis;
  if (rate.status !== "selected" || rate.value === null) return false;
  if (basis.numeratorFeeBasis === "unsupported" || basis.denominatorVolumeBasis === "unsupported" || basis.populationCompatibility === "incompatible") return false;
  const numericRate = Number(rate.value);
  if (!Number.isFinite(numericRate) || numericRate < 0) return false;
  const expected = analysis.financialFacts.totalFees.value!.amountMinor / analysis.financialFacts.processedSales.value!.amountMinor;
  return Math.abs(numericRate - expected) <= 0.000001;
}

function processorLabel(analysis: CanonicalStatementAnalysis): string | null {
  const family = analysis.identity.processorFamily;
  if (family.status !== "selected" || typeof family.value !== "string") return null;
  const normalizedFamily = normalizeProcessorIdentity(family.value);
  if (containsForbiddenCustomerProjectionContent(family.value) || !SUPPORTED_FISERV_FAMILY_IDENTITIES.has(normalizedFamily)) return null;

  const visibleBrand = analysis.identity.processorName;
  if (visibleBrand.status !== "selected" || typeof visibleBrand.value !== "string") return "Fiserv-family processor";
  if (containsForbiddenCustomerProjectionContent(visibleBrand.value)) return null;
  return APPROVED_DIRECT_PROCESSOR_LABELS.get(normalizeProcessorIdentity(visibleBrand.value)) ?? "Fiserv-family processor";
}

function normalizeProcessorIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[\/_-]+/g, " ").replace(/\s+/g, " ");
}

function feeLabelIsSafe(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 120 && !containsForbiddenCustomerProjectionContent(trimmed);
}

function permissionPermitted(
  analysis: CanonicalStatementAnalysis,
  key: CanonicalCustomerPermissionDecision["key"],
): boolean {
  return analysis.customerState.permissions.find((permission) => permission.key === key)?.permitted === true;
}

function projectedPrimaryState(
  analysis: CanonicalStatementAnalysis,
  decisions: { hideOpportunities: boolean; benchmarkUnavailable: boolean },
): CanonicalCustomerPrimaryState {
  const current = analysis.customerState.primaryState;
  if (["unable_to_analyze", "analysis_withheld", "analysis_limited"].includes(current)) return current;
  if (decisions.hideOpportunities) return "analysis_limited";
  if (decisions.benchmarkUnavailable) return "verified_benchmark_unavailable";
  return current;
}

function projectedAxisState(
  analysis: CanonicalStatementAnalysis,
  state: CanonicalCustomerPrimaryState,
  benchmarkUnavailable: boolean,
): CanonicalCustomerAxisProjection {
  const axes = { ...analysis.customerState.axes };
  if (benchmarkUnavailable) axes.ratePosition = "unavailable";
  if (state === "analysis_limited" && axes.analysisReadiness === "verified") {
    axes.analysisReadiness = "limited";
    axes.opportunityPosture = "unavailable";
  }
  return axes;
}

function money(amount: MoneyAmount | null): CustomerMoney {
  return { amountMinor: amount?.amountMinor ?? 0, currency: amount?.currency ?? "USD" };
}

function percent(rate: string): CustomerPercent {
  return { basisPoints: Math.round(Number(rate) * 10_000), displayBasis: "calculated_effective_rate" };
}

function periodLabel(period: { start: string; end: string }): string {
  return `${period.start} to ${period.end}`;
}

function syntheticSource(title: string) {
  return {
    synthetic: true as const,
    title,
    effectiveDate: "2026-04-01",
    safeUrl: "https://example.com/ratereveal-synthetic-source",
  };
}

function sectionTitle(kind: string): string {
  const labels: Record<string, string> = {
    summary: "Summary",
    verified_facts: "Verified from your statement",
    rate_basis: "Rate basis",
    opportunity_limits: "Opportunity limits",
    review_items: "Items to review",
    safe_next_step: "Next step",
  };
  return labels[kind] ?? "Report note";
}

function approvedExplanationBody(kind: string): string {
  const bodies: Record<string, string> = {
    summary: "This view includes only statement details that are ready to display.",
    verified_facts: "Verified processing volume and fee totals are shown when permitted.",
    rate_basis: "The effective rate uses verified fees and processing volume.",
    opportunity_limits: "Only opportunity amounts with complete support are shown.",
    review_items: "Items needing more support are kept out of financial conclusions.",
    safe_next_step: "Confirm applicable terms before acting on a fee review.",
  };
  return bodies[kind] ?? "Additional details are not available for this section.";
}

function headlineFor(
  state: CanonicalCustomerPrimaryState,
  decisions: { benchmarkUnavailable: boolean; hideOpportunities: boolean },
) {
  if (decisions.hideOpportunities) {
    return {
      title: "Statement details available",
      body: "Verified statement details remain available while opportunity information is withheld.",
      tone: "limited" as const,
      reasonCodes: ["opportunity_details_unavailable"],
    };
  }
  if (decisions.benchmarkUnavailable) {
    return {
      title: "Verified totals available",
      body: "Statement totals are available, but a supported rate comparison is not shown.",
      tone: "neutral" as const,
      reasonCodes: ["benchmark_unavailable"],
    };
  }
  const headlines: Record<CanonicalCustomerPrimaryState, { title: string; body: string; tone: "neutral" | "positive" | "review" | "limited" | "blocked"; reasonCodes: string[] }> = {
    unable_to_analyze: { title: "We need a clearer statement", body: "Upload a complete processing statement so the fee review can continue.", tone: "blocked", reasonCodes: ["statement_not_usable"] },
    analysis_withheld: { title: "More support is needed", body: "Some facts are present, but financial conclusions are not ready to show.", tone: "blocked", reasonCodes: ["financial_conclusions_withheld"] },
    analysis_limited: { title: "Analysis is limited", body: "Verified totals are shown, but unresolved items prevent stronger conclusions.", tone: "limited", reasonCodes: ["analysis_limited"] },
    verification_needed: { title: "Some fees still need review", body: "These amounts should be verified before treating them as savings.", tone: "review", reasonCodes: ["verification_needed"] },
    competitive_no_opportunity: { title: "Rates look competitive", body: "The verified rate fits the matched rate-comparison range and no eligible fee opportunity is shown.", tone: "positive", reasonCodes: ["competitive_no_opportunity"] },
    competitive_with_opportunity: { title: "Rates look competitive, with fee items to review", body: "The overall rate compares well, but supported fee items may still be worth addressing.", tone: "review", reasonCodes: ["competitive_with_opportunity"] },
    rate_review_needed: { title: "Pricing review recommended", body: "The verified rate is above the matched rate-comparison range.", tone: "review", reasonCodes: ["rate_review_needed"] },
    rate_review_with_opportunity: { title: "Pricing and fee review recommended", body: "The verified rate is above reference and supported fee opportunities are visible.", tone: "review", reasonCodes: ["rate_review_with_opportunity"] },
    fee_opportunity_identified: { title: "Fee opportunity identified", body: "Supported fee items are available for review.", tone: "review", reasonCodes: ["fee_opportunity_identified"] },
    material_fee_opportunity: { title: "Material fee opportunity identified", body: "Supported fee items appear large enough to prioritize.", tone: "review", reasonCodes: ["material_fee_opportunity"] },
    verified_benchmark_unavailable: { title: "Verified totals available", body: "Statement totals are available, but a rate comparison is not shown.", tone: "neutral", reasonCodes: ["benchmark_unavailable"] },
  };
  return headlines[state];
}

function actionCopy(actionType: CanonicalCustomerActionGuidance["actionType"]) {
  const copy: Record<CanonicalCustomerActionGuidance["actionType"], { label: string; body: string }> = {
    review_documentation: { label: "Review documentation", body: "Gather the agreement or addendum that explains this charge." },
    verify_charge: { label: "Verify this charge", body: "Ask your processor to explain the charge and how it applies." },
    request_explanation: { label: "Request an explanation", body: "Ask your processor to explain the fee and whether it can change." },
    request_removal: { label: "Ask about removal", body: "Ask whether the supported charge can be removed based on the documented reason." },
    request_repricing: { label: "Request pricing review", body: "Ask your processor to review the supported pricing item." },
    monitor: { label: "Monitor next statement", body: "Check another statement period before making a conclusion." },
    no_action: { label: "No action needed", body: "Keep this statement for your records." },
  };
  return copy[actionType];
}

function methodologyGuidance(state: CanonicalCustomerPrimaryState): string[] {
  if (state === "analysis_limited") return ["Review unresolved fee details before relying on opportunity amounts."];
  return ["Amounts shown here come from verified and permitted statement facts."];
}

function docsToGather(state: CanonicalCustomerPrimaryState): string[] {
  if (state === "verification_needed") return ["Processor agreement", "Pricing addendum", "Recent statement"];
  return ["Processor agreement", "Pricing addendum"];
}
