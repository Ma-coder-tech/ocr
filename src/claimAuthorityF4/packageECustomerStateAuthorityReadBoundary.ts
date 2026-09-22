import { buildCanonicalCustomerActionGuidance } from "../canonical/customerActionGuidance.js";
import { buildCanonicalCustomerState } from "../canonical/customerStateResolver.js";
import { aggregateCanonicalOpportunityComponents } from "../canonical/opportunityEngine.js";
import type {
  CanonicalCustomerActionGuidance,
  CanonicalCustomerPermissionDecision,
  CanonicalCustomerStateProjection,
  CanonicalOpportunityComponent,
  CanonicalOpportunityEngine,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "../canonical/types.js";
import type { MerchantAttentionMarkupShadowComparison } from "./merchantAttentionShadowComparison.js";

type Change<T> = {
  legacy: T;
  predicted: T;
  changed: boolean;
};

type PermissionSnapshot = Array<{
  key: CanonicalCustomerPermissionDecision["key"];
  permitted: boolean;
  reasonCodes: string[];
}>;

type CustomerStateSnapshot = {
  primaryState: CanonicalCustomerStateProjection["primaryState"];
  axes: CanonicalCustomerStateProjection["axes"];
  permissions: PermissionSnapshot;
  visibility: {
    showOwnershipActionability: boolean;
    showVerificationAmounts: boolean;
    showActions: boolean;
    visibleVerificationOnlyObservedAmount: MoneyAmount;
  };
  preliminaryActionTypes: CanonicalCustomerActionGuidance["actionType"][];
  actionGuidanceTypes: CanonicalCustomerActionGuidance["actionType"][];
};

type PredictedCutoverDiagnostics = {
  standing: "diagnostic_only_not_applied";
  verificationOnlyObservedAmount: Change<MoneyAmount>;
  excludedObservedAmount: Change<MoneyAmount>;
  totalEligibleAnnualAmount: Change<MoneyAmount>;
  masterSavingsAnnualAmount: Change<MoneyAmount>;
  customerStateClassification: Change<{
    primaryState: CanonicalCustomerStateProjection["primaryState"];
    axes: CanonicalCustomerStateProjection["axes"];
  }>;
  permissions: Change<PermissionSnapshot>;
  visibleVerification: Change<{
    shown: boolean;
    amount: MoneyAmount;
  }>;
  preliminaryActionTypes: Change<CanonicalCustomerActionGuidance["actionType"][]>;
  actionGuidanceTypes: Change<CanonicalCustomerActionGuidance["actionType"][]>;
};

export type PackageECustomerStateAuthorityReadBoundary = {
  version: "package_e_customer_state_authority_read_boundary_v1";
  standing: "internal_diagnostic_only";
  semanticAuthority: "claim_authority_f4";
  status: "available" | "unavailable";
  sourceReportId: string | null;
  rows: Array<{
    feeRowId: string;
    legacyCandidateId: string;
    opportunityComponentId: string;
    gate: {
      legacyPackageDCategory: "processor_markup";
      observedFeeComponent: "supported";
      processorMarkup: "refused" | "unknown";
      actionability: "refused" | "unknown";
      potentialNegotiation: "not_established";
    };
    legacyComparison: {
      packageE: {
        kind: CanonicalOpportunityComponent["kind"];
        ownership: CanonicalOpportunityComponent["ownership"];
        actionabilityCeiling: CanonicalOpportunityComponent["actionabilityCeiling"];
        eligibility: CanonicalOpportunityComponent["eligibility"];
        inclusionStatus: CanonicalOpportunityComponent["inclusionStatus"];
        observedAmount: CanonicalOpportunityComponent["observedAmount"];
        evidenceRefs: string[];
      };
      preliminaryActionTypes: CanonicalCustomerActionGuidance["actionType"][];
      actionGuidanceTypes: CanonicalCustomerActionGuidance["actionType"][];
    };
    authorityBacked: {
      standing: "internal_only";
      ownership: {
        collector: "unknown";
        economicBeneficiary: "unknown";
        contractualController: "unknown";
      };
      actionability: "not_established";
      opportunityKind: "fee_row_review";
      observedAmount: CanonicalOpportunityComponent["observedAmount"];
      evidenceRefs: string[];
      verificationStanding: "verification_only_evidence_review";
      neutralPreliminaryActionCandidate: "request_explanation";
      opportunityAuthority: "none_not_established";
      savingsAuthority: "none_not_established";
      eligibleSavings: MoneyAmount;
      masterSavings: MoneyAmount;
    };
    predictedCutover: PredictedCutoverDiagnostics;
  }>;
  statement: {
    gatedRowCount: number;
    gatedComponentCount: number;
    legacy: CustomerStateSnapshot & {
      verificationOnlyObservedAmount: MoneyAmount;
      excludedObservedAmount: MoneyAmount;
      masterSavingsAnnualAmount: MoneyAmount;
    };
    predictedCutover: PredictedCutoverDiagnostics;
  } | null;
  summary: {
    gatedRows: number;
    modeledRows: number;
    unmatchedRows: number;
    ownerUnknown: number;
    controllerUnknown: number;
    actionabilityNotEstablished: number;
    feeRowReviewPreserved: number;
    observedAmountPreserved: number;
    evidencePreserved: number;
    masterSavingsUnchanged: number;
    verificationOnlyEvidenceReview: number;
    neutralRequestExplanationCandidates: number;
    positiveOpportunityAuthority: number;
    positiveSavingsAuthority: number;
    eligibleSavingsAmountMinor: number;
  };
};

type AuthorityReadRow = PackageECustomerStateAuthorityReadBoundary["rows"][number];

type Projection = {
  engine: CanonicalOpportunityEngine;
  customerState: CanonicalCustomerStateProjection;
  preliminaryActions: CanonicalCustomerActionGuidance[];
};

export function unavailablePackageECustomerStateAuthorityReadBoundary(
  sourceReportId: string | null,
): PackageECustomerStateAuthorityReadBoundary {
  return {
    version: "package_e_customer_state_authority_read_boundary_v1",
    standing: "internal_diagnostic_only",
    semanticAuthority: "claim_authority_f4",
    status: "unavailable",
    sourceReportId,
    rows: [],
    statement: null,
    summary: emptySummary(),
  };
}

export function buildPackageECustomerStateAuthorityReadBoundary(input: {
  analysis: CanonicalStatementAnalysis;
  merchantAttentionMarkupShadow: MerchantAttentionMarkupShadowComparison;
}): PackageECustomerStateAuthorityReadBoundary {
  const { analysis, merchantAttentionMarkupShadow } = input;
  const gatedRows = merchantAttentionMarkupShadow.status === "available"
    ? merchantAttentionMarkupShadow.rows.filter(authorityBackedPackageEReadEligible)
    : [];
  const legacyProjection = projection(analysis, analysis.opportunityEngine);
  const rows: PackageECustomerStateAuthorityReadBoundary["rows"] = [];

  for (const shadowRow of gatedRows) {
    const components = feeRowReviewComponents(analysis.opportunityEngine, shadowRow.feeRowId);
    if (components.length !== 1) continue;
    const component = components[0]!;
    const legacyActions = actionTypesForComponents(legacyProjection.preliminaryActions, new Set([component.id]));
    if (component.eligibility !== "verification_only"
      || component.observedAmount === null
      || component.observedAmount.amount.amountMinor <= 0
      || component.evidenceRefs.length === 0
      || !equal(component.observedAmount.amount, shadowRow.observedAmount)
      || !equal(actionTypes(legacyActions), ["verify_charge"])) continue;
    const predicted = predictedProjection(analysis, new Set([component.id]));
    const predictedActions = actionTypesForComponents(predicted.preliminaryActions, new Set([component.id]));
    const legacyGuidance = actionTypesForComponents(analysis.customerState.actionGuidance, new Set([component.id]));
    const predictedGuidance = actionTypesForComponents(predicted.customerState.actionGuidance, new Set([component.id]));
    const currency = component.observedAmount?.amount.currency ?? analysis.opportunityEngine.summary.masterSavingsAnnualAmount.currency;

    rows.push({
      feeRowId: shadowRow.feeRowId,
      legacyCandidateId: shadowRow.legacyCandidateId,
      opportunityComponentId: component.id,
      gate: {
        legacyPackageDCategory: "processor_markup",
        observedFeeComponent: "supported",
        processorMarkup: shadowRow.f4.processorMarkup.status,
        actionability: shadowRow.f4.actionability.status,
        potentialNegotiation: "not_established",
      },
      legacyComparison: {
        packageE: {
          kind: component.kind,
          ownership: clone(component.ownership),
          actionabilityCeiling: component.actionabilityCeiling,
          eligibility: component.eligibility,
          inclusionStatus: component.inclusionStatus,
          observedAmount: clone(component.observedAmount),
          evidenceRefs: [...component.evidenceRefs],
        },
        preliminaryActionTypes: actionTypes(legacyActions),
        actionGuidanceTypes: actionTypes(legacyGuidance),
      },
      authorityBacked: {
        standing: "internal_only",
        ownership: {
          collector: "unknown",
          economicBeneficiary: "unknown",
          contractualController: "unknown",
        },
        actionability: "not_established",
        opportunityKind: "fee_row_review",
        observedAmount: clone(component.observedAmount),
        evidenceRefs: [...component.evidenceRefs],
        verificationStanding: "verification_only_evidence_review",
        neutralPreliminaryActionCandidate: "request_explanation",
        opportunityAuthority: "none_not_established",
        savingsAuthority: "none_not_established",
        eligibleSavings: { amountMinor: 0, currency },
        masterSavings: clone(analysis.opportunityEngine.summary.masterSavingsAnnualAmount),
      },
      predictedCutover: diagnostics(
        legacyProjection,
        predicted,
        legacyActions,
        predictedActions,
        legacyGuidance,
        predictedGuidance,
      ),
    });
  }

  const allComponentIds = new Set(rows.map((row) => row.opportunityComponentId));
  const statementPrediction = rows.length === 0 ? legacyProjection : predictedProjection(analysis, allComponentIds);
  const statement = merchantAttentionMarkupShadow.status === "available" ? {
    gatedRowCount: gatedRows.length,
    gatedComponentCount: rows.length,
    legacy: {
      ...customerStateSnapshot(legacyProjection.customerState, legacyProjection.preliminaryActions),
      verificationOnlyObservedAmount: clone(legacyProjection.engine.summary.verificationOnlyObservedAmount),
      excludedObservedAmount: clone(legacyProjection.engine.summary.excludedObservedAmount),
      masterSavingsAnnualAmount: clone(legacyProjection.engine.summary.masterSavingsAnnualAmount),
    },
    predictedCutover: diagnostics(
      legacyProjection,
      statementPrediction,
      legacyProjection.preliminaryActions,
      statementPrediction.preliminaryActions,
      legacyProjection.customerState.actionGuidance,
      statementPrediction.customerState.actionGuidance,
    ),
  } : null;

  return {
    version: "package_e_customer_state_authority_read_boundary_v1",
    standing: "internal_diagnostic_only",
    semanticAuthority: "claim_authority_f4",
    status: merchantAttentionMarkupShadow.status,
    sourceReportId: merchantAttentionMarkupShadow.sourceReportId,
    rows,
    statement,
    summary: {
      gatedRows: gatedRows.length,
      modeledRows: rows.length,
      unmatchedRows: gatedRows.length - rows.length,
      ownerUnknown: rows.filter((row) => row.authorityBacked.ownership.economicBeneficiary === "unknown").length,
      controllerUnknown: rows.filter((row) => row.authorityBacked.ownership.contractualController === "unknown").length,
      actionabilityNotEstablished: rows.filter((row) => row.authorityBacked.actionability === "not_established").length,
      feeRowReviewPreserved: rows.filter((row) => row.authorityBacked.opportunityKind === row.legacyComparison.packageE.kind).length,
      observedAmountPreserved: rows.filter((row) => equal(row.authorityBacked.observedAmount, row.legacyComparison.packageE.observedAmount)).length,
      evidencePreserved: rows.filter((row) => equal(row.authorityBacked.evidenceRefs, row.legacyComparison.packageE.evidenceRefs)).length,
      masterSavingsUnchanged: rows.filter((row) => equal(
        row.authorityBacked.masterSavings,
        analysis.opportunityEngine.summary.masterSavingsAnnualAmount,
      )).length,
      verificationOnlyEvidenceReview: rows.filter((row) => row.authorityBacked.verificationStanding === "verification_only_evidence_review").length,
      neutralRequestExplanationCandidates: rows.filter((row) => row.authorityBacked.neutralPreliminaryActionCandidate === "request_explanation").length,
      positiveOpportunityAuthority: 0,
      positiveSavingsAuthority: 0,
      eligibleSavingsAmountMinor: rows.reduce((sum, row) => sum + row.authorityBacked.eligibleSavings.amountMinor, 0),
    },
  };
}

/**
 * Applies the Product-approved Package E/customer-state cutover only to rows that
 * still satisfy the exact authority and evidence gate represented by this read
 * boundary. The general unknown-owner eligibility policy remains unchanged.
 */
export function applyPackageECustomerStateAuthorityCutover(input: {
  analysis: CanonicalStatementAnalysis;
  authorityReadBoundary: PackageECustomerStateAuthorityReadBoundary;
}): CanonicalStatementAnalysis {
  const { analysis, authorityReadBoundary } = input;
  if (authorityReadBoundary.status !== "available" || authorityReadBoundary.rows.length === 0) return analysis;

  const componentIds = new Set<string>();
  for (const row of authorityReadBoundary.rows) {
    const components = feeRowReviewComponents(analysis.opportunityEngine, row.feeRowId);
    if (components.length !== 1) continue;
    const component = components[0]!;
    const classification = analysis.feeOwnershipActionability.rowClassifications.find((item) =>
      item.feeRowId === row.feeRowId && item.selected.candidateId === row.legacyCandidateId);
    if (!classification || !livePackageECutoverEligible(row, component, classification.selected.category)) continue;
    componentIds.add(component.id);
  }
  if (componentIds.size === 0) return analysis;

  const projected = predictedProjection(analysis, componentIds);
  return {
    ...analysis,
    opportunityEngine: projected.engine,
    customerState: projected.customerState,
  };
}

function emptySummary(): PackageECustomerStateAuthorityReadBoundary["summary"] {
  return {
    gatedRows: 0,
    modeledRows: 0,
    unmatchedRows: 0,
    ownerUnknown: 0,
    controllerUnknown: 0,
    actionabilityNotEstablished: 0,
    feeRowReviewPreserved: 0,
    observedAmountPreserved: 0,
    evidencePreserved: 0,
    masterSavingsUnchanged: 0,
    verificationOnlyEvidenceReview: 0,
    neutralRequestExplanationCandidates: 0,
    positiveOpportunityAuthority: 0,
    positiveSavingsAuthority: 0,
    eligibleSavingsAmountMinor: 0,
  };
}

function authorityBackedPackageEReadEligible(
  row: MerchantAttentionMarkupShadowComparison["rows"][number],
): row is MerchantAttentionMarkupShadowComparison["rows"][number] & {
  f4: {
    processorMarkup: { status: "refused" | "unknown"; reasonCodes: string[] };
    actionability: { status: "refused" | "unknown"; reasonCodes: string[] };
  };
} {
  return row.currentSelected.category === "processor_markup"
    && row.authorityBackedSemantics.observedFeeComponent === "supported"
    && row.authorityBackedSemantics.actionability === "not_established"
    && row.authorityBackedSemantics.potentialNegotiation === "not_established"
    && row.f4.processorMarkup.status !== "supported"
    && row.f4.actionability.status !== "supported";
}

function feeRowReviewComponents(engine: CanonicalOpportunityEngine, feeRowId: string): CanonicalOpportunityComponent[] {
  return engine.components.filter((component) => component.kind === "fee_row_review"
    && component.feeRowRefs.some((ref) => ref.feeRowId === feeRowId));
}

function projection(analysis: CanonicalStatementAnalysis, engine: CanonicalOpportunityEngine): Projection {
  return {
    engine,
    customerState: analysis.customerState,
    preliminaryActions: buildCanonicalCustomerActionGuidance({
      opportunityEngine: engine,
      classifications: analysis.feeOwnershipActionability.rowClassifications,
    }),
  };
}

function predictedProjection(analysis: CanonicalStatementAnalysis, componentIds: Set<string>): Projection {
  const engine = clone(analysis.opportunityEngine);
  for (const component of engine.components) {
    if (!componentIds.has(component.id)) continue;
    component.ownership = { collector: "unknown", economicBeneficiary: "unknown", contractualController: "unknown" };
    component.actionabilityCeiling = "unknown";
    component.kind = "fee_row_review";
    component.eligibility = "verification_only";
    component.inclusionStatus = "excluded";
    component.inclusionReasonCodes = [];
    component.exclusionReasonCodes = ["authority_gated_unresolved_evidence_review"];
    // Product explicitly preserves verification-only as an evidence-review state.
    // Do not run defaultEligibility: the general unknown-owner rule remains unchanged.
  }
  engine.summary = aggregateCanonicalOpportunityComponents(engine.components);
  const preliminaryActions = buildCanonicalCustomerActionGuidance({
    opportunityEngine: engine,
    classifications: analysis.feeOwnershipActionability.rowClassifications,
  });
  const customerState = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: engine,
    aiCapabilities: analysis.aiCapabilities,
    rateComparison: analysis.customerState.rateComparison,
  });
  return { engine, customerState, preliminaryActions };
}

function livePackageECutoverEligible(
  row: AuthorityReadRow,
  component: CanonicalOpportunityComponent,
  selectedCategory: string,
): boolean {
  return selectedCategory === "processor_markup"
    && row.gate.legacyPackageDCategory === "processor_markup"
    && row.gate.observedFeeComponent === "supported"
    && row.gate.potentialNegotiation === "not_established"
    && row.authorityBacked.ownership.collector === "unknown"
    && row.authorityBacked.ownership.economicBeneficiary === "unknown"
    && row.authorityBacked.ownership.contractualController === "unknown"
    && row.authorityBacked.actionability === "not_established"
    && row.authorityBacked.verificationStanding === "verification_only_evidence_review"
    && row.authorityBacked.neutralPreliminaryActionCandidate === "request_explanation"
    && row.authorityBacked.opportunityAuthority === "none_not_established"
    && row.authorityBacked.savingsAuthority === "none_not_established"
    && row.authorityBacked.eligibleSavings.amountMinor === 0
    && component.id === row.opportunityComponentId
    && component.kind === "fee_row_review"
    && component.eligibility === "verification_only"
    && component.inclusionStatus === "excluded"
    && component.observedAmount !== null
    && component.observedAmount.amount.amountMinor > 0
    && component.evidenceRefs.length > 0
    && equal(component.observedAmount, row.legacyComparison.packageE.observedAmount)
    && equal(component.evidenceRefs, row.legacyComparison.packageE.evidenceRefs)
    && component.target.type === "none"
    && component.calculation.calculationRef === null
    && component.calculation.formulaCode === "none_not_eligible"
    && component.calculation.result === null;
}

function diagnostics(
  legacy: Projection,
  predicted: Projection,
  legacyPreliminaryActions: CanonicalCustomerActionGuidance[],
  predictedPreliminaryActions: CanonicalCustomerActionGuidance[],
  legacyGuidance: CanonicalCustomerActionGuidance[],
  predictedGuidance: CanonicalCustomerActionGuidance[],
): PredictedCutoverDiagnostics {
  const legacyState = customerStateSnapshot(legacy.customerState, legacyPreliminaryActions);
  const predictedState = customerStateSnapshot(predicted.customerState, predictedPreliminaryActions);
  return {
    standing: "diagnostic_only_not_applied",
    verificationOnlyObservedAmount: change(
      legacy.engine.summary.verificationOnlyObservedAmount,
      predicted.engine.summary.verificationOnlyObservedAmount,
    ),
    excludedObservedAmount: change(
      legacy.engine.summary.excludedObservedAmount,
      predicted.engine.summary.excludedObservedAmount,
    ),
    totalEligibleAnnualAmount: change(
      legacy.engine.summary.totalEligibleAnnualAmount,
      predicted.engine.summary.totalEligibleAnnualAmount,
    ),
    masterSavingsAnnualAmount: change(
      legacy.engine.summary.masterSavingsAnnualAmount,
      predicted.engine.summary.masterSavingsAnnualAmount,
    ),
    customerStateClassification: change(
      { primaryState: legacyState.primaryState, axes: legacyState.axes },
      { primaryState: predictedState.primaryState, axes: predictedState.axes },
    ),
    permissions: change(legacyState.permissions, predictedState.permissions),
    visibleVerification: change(
      { shown: legacyState.visibility.showVerificationAmounts,
        amount: legacyState.visibility.visibleVerificationOnlyObservedAmount },
      { shown: predictedState.visibility.showVerificationAmounts,
        amount: predictedState.visibility.visibleVerificationOnlyObservedAmount },
    ),
    preliminaryActionTypes: change(
      legacyPreliminaryActions.map((action) => action.actionType).sort(),
      predictedPreliminaryActions.map((action) => action.actionType).sort(),
    ),
    actionGuidanceTypes: change(
      legacyGuidance.map((action) => action.actionType).sort(),
      predictedGuidance.map((action) => action.actionType).sort(),
    ),
  };
}

function customerStateSnapshot(
  state: CanonicalCustomerStateProjection,
  preliminaryActions: CanonicalCustomerActionGuidance[],
): CustomerStateSnapshot {
  return {
    primaryState: state.primaryState,
    axes: clone(state.axes),
    permissions: state.permissions.map((permission) => ({
      key: permission.key,
      permitted: permission.permitted,
      reasonCodes: [...permission.reasonCodes],
    })),
    visibility: {
      showOwnershipActionability: state.visibility.showOwnershipActionability,
      showVerificationAmounts: state.visibility.showVerificationAmounts,
      showActions: state.visibility.showActions,
      visibleVerificationOnlyObservedAmount: clone(state.visibility.visibleVerificationOnlyObservedAmount),
    },
    preliminaryActionTypes: preliminaryActions.map((action) => action.actionType).sort(),
    actionGuidanceTypes: state.actionGuidance.map((action) => action.actionType).sort(),
  };
}

function actionTypesForComponents(
  actions: CanonicalCustomerActionGuidance[],
  componentIds: Set<string>,
): CanonicalCustomerActionGuidance[] {
  return actions.filter((action) => [...action.opportunityComponentRefs, ...action.verificationComponentRefs]
    .some((id) => componentIds.has(id)));
}

function actionTypes(actions: CanonicalCustomerActionGuidance[]): CanonicalCustomerActionGuidance["actionType"][] {
  return actions.map((action) => action.actionType).sort();
}

function change<T>(legacy: T, predicted: T): Change<T> {
  return { legacy: clone(legacy), predicted: clone(predicted), changed: !equal(legacy, predicted) };
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
