import { buildGrossBasedRateDiagnostic, buildHeadlineAverageTicket } from "./metrics.js";
import type {
  CanonicalEconomicsV2Calculation,
  CanonicalEconomicsV2CapabilityId,
  CanonicalEconomicsV2FinancialPopulations,
  CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2SourceOccurrence,
} from "./types.js";

type RbFinancialPopulationKey = keyof CanonicalEconomicsV2FinancialPopulations;

type RbOperationalDependencyRegistryEntry = {
  nodeId: string;
  nodeKind: "fact" | "metric" | "control";
  calculationId: string | null;
  dependencies: readonly RbFinancialPopulationKey[];
  strategy:
    | "preserve_existing_fact"
    | "preserve_existing_metric"
    | "recompute_if_preconfigured"
    | "recompute"
    | "subtract_money_equals_money"
    | "add_counts_equals_count";
  permissionPolicy:
    | "never_derive_from_limited_authority"
    | "preserve_existing_permission"
    | "configured_inputs_required"
    | "available_inputs_required"
    | "control_inputs_required";
};

export type RbClaimCapabilityDependencyRegistryEntry = {
  nodeId: string;
  nodeKind: "capability";
  capabilityId: "settlement_adjustments" | "chargeback_financial_populations";
  calculationId: null;
  dependencies: readonly RbFinancialPopulationKey[];
  strategy: "admit_from_independent_document_ir_control";
  permissionPolicy: "claim_specific_evidence_required";
  controlIdentity: string;
  sourceSemanticRole: CanonicalEconomicsV2SourceOccurrence["semanticRole"];
  forbiddenDependencies: readonly ["fundingLedgerStatus", "fundingBatchPopulation", "fundingReconciliationStatus"];
};

type RbDependencyRegistryEntry = RbOperationalDependencyRegistryEntry | RbClaimCapabilityDependencyRegistryEntry;

export type RbDependencyPermission = {
  state: "permitted" | "withheld" | "not_configured" | "preserved" | "prohibited";
  dependencyPopulationKeys: string[];
  reasonCodes: string[];
};

export type RbDependencyRelationshipControl = {
  id: "gross_refund_equals_net_submitted" | "gross_refund_count_equals_submitted_count";
  state: "pass" | "fail" | "unresolved";
  dependencyPopulationKeys: string[];
  observedLeft: number | null;
  observedRight: number | null;
};

export const RB_DEPENDENCY_REGISTRY = [
  {
    nodeId: "fact_v2_canonical_net_submitted_card_volume",
    nodeKind: "fact",
    calculationId: null,
    dependencies: ["grossSaleVolume", "refundVolume"],
    strategy: "preserve_existing_fact",
    permissionPolicy: "never_derive_from_limited_authority",
  },
  {
    nodeId: "metric_v2_headline_effective_rate",
    nodeKind: "metric",
    calculationId: "calc_v2_headline_effective_rate",
    dependencies: ["totalStatementProcessingFees", "canonicalNetSubmittedCardVolume"],
    strategy: "preserve_existing_metric",
    permissionPolicy: "preserve_existing_permission",
  },
  {
    nodeId: "metric_v2_gross_based_rate_diagnostic",
    nodeKind: "metric",
    calculationId: "calc_v2_gross_based_rate_diagnostic",
    dependencies: ["totalStatementProcessingFees", "grossSaleVolume"],
    strategy: "recompute_if_preconfigured",
    permissionPolicy: "configured_inputs_required",
  },
  {
    nodeId: "metric_v2_headline_average_ticket",
    nodeKind: "metric",
    calculationId: "calc_v2_headline_average_ticket",
    dependencies: ["grossSaleVolume", "grossSaleTransactionCount"],
    strategy: "recompute",
    permissionPolicy: "available_inputs_required",
  },
  {
    nodeId: "gross_refund_equals_net_submitted",
    nodeKind: "control",
    calculationId: null,
    dependencies: ["grossSaleVolume", "refundVolume", "canonicalNetSubmittedCardVolume"],
    strategy: "subtract_money_equals_money",
    permissionPolicy: "control_inputs_required",
  },
  {
    nodeId: "gross_refund_count_equals_submitted_count",
    nodeKind: "control",
    calculationId: null,
    dependencies: ["grossSaleTransactionCount", "refundTransactionCount", "submittedTransactionCount"],
    strategy: "add_counts_equals_count",
    permissionPolicy: "control_inputs_required",
  },
  {
    nodeId: "capability_settlement_adjustment",
    nodeKind: "capability",
    capabilityId: "settlement_adjustments",
    calculationId: null,
    dependencies: ["settlementAdjustmentAmount"],
    strategy: "admit_from_independent_document_ir_control",
    permissionPolicy: "claim_specific_evidence_required",
    controlIdentity: "independent_split_population:settlementAdjustmentAmount",
    sourceSemanticRole: "settlement_adjustment",
    forbiddenDependencies: ["fundingLedgerStatus", "fundingBatchPopulation", "fundingReconciliationStatus"],
  },
  {
    nodeId: "capability_chargeback_principal",
    nodeKind: "capability",
    capabilityId: "chargeback_financial_populations",
    calculationId: null,
    dependencies: ["chargebackPrincipalDebitAmount"],
    strategy: "admit_from_independent_document_ir_control",
    permissionPolicy: "claim_specific_evidence_required",
    controlIdentity: "independent_split_population:chargebackPrincipalDebitAmount",
    sourceSemanticRole: "chargeback_principal_debit",
    forbiddenDependencies: ["fundingLedgerStatus", "fundingBatchPopulation", "fundingReconciliationStatus"],
  },
  {
    nodeId: "capability_chargeback_representment",
    nodeKind: "capability",
    capabilityId: "chargeback_financial_populations",
    calculationId: null,
    dependencies: ["chargebackRepresentmentAmount"],
    strategy: "admit_from_independent_document_ir_control",
    permissionPolicy: "claim_specific_evidence_required",
    controlIdentity: "independent_split_population:chargebackRepresentmentAmount",
    sourceSemanticRole: "chargeback_representment",
    forbiddenDependencies: ["fundingLedgerStatus", "fundingBatchPopulation", "fundingReconciliationStatus"],
  },
] as const satisfies readonly RbDependencyRegistryEntry[];

export type RbClaimCapabilityDependencyEvaluation = {
  capabilityId: "settlement_adjustments" | "chargeback_financial_populations";
  status: "supported" | "unknown";
  dependencyNodeIds: string[];
  dependencyPopulationKeys: string[];
  proofEvidenceRefs: string[];
  reasonCodes: string[];
  nodeOutcomes: Array<{
    nodeId: string;
    status: "pass" | "unresolved";
    controlIdentity: string;
    dependencyPopulationKeys: string[];
    proofEvidenceRefs: string[];
    reasonCodes: string[];
  }>;
};

/**
 * Evaluates sensitive claim capabilities only from their registered DocumentIR
 * population proof. Funding-ledger health is deliberately unavailable here.
 */
export function evaluateRbClaimCapabilityDependencies(input: {
  capabilityId: RbClaimCapabilityDependencyEvaluation["capabilityId"];
  foundation: Pick<CanonicalEconomicsV2Foundation, "sourceModel" | "reconciliation">;
  statementCompleteness?: "proven_complete" | "proven_incomplete" | "unproven";
}): RbClaimCapabilityDependencyEvaluation {
  const entries = claimCapabilityEntries().filter((entry) => entry.capabilityId === input.capabilityId);
  const nodeOutcomes = entries.map((registryEntry) => {
    const controls = input.foundation.reconciliation.filter((control) =>
      control.implementation === "independent_document_ir"
      && control.controlIdentity === registryEntry.controlIdentity);
    const passingControls = controls.filter((control) =>
      control.status === "pass" || control.status === "pass_with_rounding");
    const failedControl = controls.some((control) => control.status === "fail");
    const proofEvidenceRefs = unique(passingControls.flatMap((control) => control.evidenceRefs));
    const roleEvidenceRefs = new Set(input.foundation.sourceModel.occurrences
      .filter((occurrence) => occurrence.semanticRole === registryEntry.sourceSemanticRole
        && occurrence.contributionRole !== "funding_only")
      .map((occurrence) => occurrence.evidenceRef));
    const lineageMatched = proofEvidenceRefs.length > 0
      && proofEvidenceRefs.every((evidenceRef) => roleEvidenceRefs.has(evidenceRef));
    const sourceProvenIncomplete = input.statementCompleteness === "proven_incomplete";
    const status = passingControls.length === 1 && !failedControl && lineageMatched && !sourceProvenIncomplete
      ? "pass" as const : "unresolved" as const;
    return {
      nodeId: registryEntry.nodeId,
      status,
      controlIdentity: registryEntry.controlIdentity,
      dependencyPopulationKeys: [...registryEntry.dependencies],
      proofEvidenceRefs: status === "pass" ? proofEvidenceRefs : [],
      reasonCodes: status === "pass"
        ? ["claim_specific_document_ir_control_passed", "funding_ledger_not_a_dependency"]
        : unique([
            ...(controls.length === 0 ? ["claim_specific_control_missing"] : []),
            ...(passingControls.length !== 1 ? ["claim_specific_control_not_uniquely_passing"] : []),
            ...(failedControl ? ["claim_specific_control_failed"] : []),
            ...(lineageMatched ? [] : ["claim_specific_control_lineage_incomplete"]),
            ...(sourceProvenIncomplete ? ["processor_statement_proven_incomplete"] : []),
          ]),
    };
  });
  const passing = nodeOutcomes.filter((outcome) => outcome.status === "pass");
  return {
    capabilityId: input.capabilityId,
    status: passing.length > 0 ? "supported" : "unknown",
    dependencyNodeIds: entries.map((entry) => entry.nodeId),
    dependencyPopulationKeys: unique(entries.flatMap((entry) => [...entry.dependencies])),
    proofEvidenceRefs: unique(passing.flatMap((outcome) => outcome.proofEvidenceRefs)),
    reasonCodes: passing.length > 0
      ? ["claim_specific_registry_dependency_satisfied", "funding_ledger_not_a_dependency"]
      : unique(nodeOutcomes.flatMap((outcome) => outcome.reasonCodes)),
    nodeOutcomes,
  };
}

export type RbDependencyRegistryProjection = {
  registryVersion: "rb_dependency_registry_v1";
  registryValidation: { status: "valid" | "invalid"; errors: string[] };
  metrics: CanonicalEconomicsV2Foundation["metrics"];
  calculations: CanonicalEconomicsV2Calculation[];
  relationshipControls: {
    before: RbDependencyRelationshipControl[];
    after: RbDependencyRelationshipControl[];
  };
  calculationPermissions: {
    headlineEffectiveRate: { before: RbDependencyPermission; after: RbDependencyPermission };
    grossBasedRateDiagnostic: { before: RbDependencyPermission; after: RbDependencyPermission };
    headlineAverageTicket: { before: RbDependencyPermission; after: RbDependencyPermission };
    grossRefundNetControl: { before: RbDependencyPermission; after: RbDependencyPermission };
    submittedCountControl: { before: RbDependencyPermission; after: RbDependencyPermission };
  };
  nodeOutcomes: Array<{
    nodeId: string;
    nodeKind: "fact" | "metric" | "control" | "capability";
    calculationId: string | null;
    dependencyPopulationKeys: string[];
    strategy: RbDependencyRegistryEntry["strategy"];
    permissionBefore: RbDependencyPermission;
    permissionAfter: RbDependencyPermission;
  }>;
};

export function evaluateRbDependencyRegistry(input: {
  foundation: CanonicalEconomicsV2Foundation;
  before: CanonicalEconomicsV2FinancialPopulations;
  after: CanonicalEconomicsV2FinancialPopulations;
}): RbDependencyRegistryProjection {
  const registryErrors = validateRegistry();
  const beforeControls = controlEntries().map((entry) => evaluateControl(entry, input.before));
  const afterControls = controlEntries().map((entry) => evaluateControl(entry, input.after));

  const averageEntry = entry("metric_v2_headline_average_ticket");
  const average = buildHeadlineAverageTicket({
    grossSales: input.after.grossSaleVolume,
    grossSaleCount: input.after.grossSaleTransactionCount,
  });
  const grossRateEntry = entry("metric_v2_gross_based_rate_diagnostic");
  const grossRate = input.foundation.metrics.grossBasedRateDiagnostic
    ? buildGrossBasedRateDiagnostic({
        fees: input.after.totalStatementProcessingFees,
        grossSales: input.after.grossSaleVolume,
      })
    : null;
  const metrics: CanonicalEconomicsV2Foundation["metrics"] = {
    headlineEffectiveRate: structuredClone(input.foundation.metrics.headlineEffectiveRate),
    grossBasedRateDiagnostic: grossRate?.metric ?? null,
    headlineAverageTicket: average.metric,
  };
  const calculations = replaceRegisteredCalculations(input.foundation.calculations, [
    { entry: averageEntry, calculation: average.calculation, configured: true },
    { entry: grossRateEntry, calculation: grossRate?.calculation ?? null,
      configured: input.foundation.metrics.grossBasedRateDiagnostic !== null },
  ]);

  const beforePermissions = permissions(input.foundation, input.before, beforeControls);
  const afterPermissions = permissions({ ...input.foundation, metrics }, input.after, afterControls);
  return {
    registryVersion: "rb_dependency_registry_v1",
    registryValidation: { status: registryErrors.length === 0 ? "valid" : "invalid", errors: registryErrors },
    metrics,
    calculations,
    relationshipControls: { before: beforeControls, after: afterControls },
    calculationPermissions: {
      headlineEffectiveRate: { before: beforePermissions.headlineEffectiveRate, after: afterPermissions.headlineEffectiveRate },
      grossBasedRateDiagnostic: { before: beforePermissions.grossBasedRateDiagnostic, after: afterPermissions.grossBasedRateDiagnostic },
      headlineAverageTicket: { before: beforePermissions.headlineAverageTicket, after: afterPermissions.headlineAverageTicket },
      grossRefundNetControl: { before: beforePermissions.grossRefundNetControl, after: afterPermissions.grossRefundNetControl },
      submittedCountControl: { before: beforePermissions.submittedCountControl, after: afterPermissions.submittedCountControl },
    },
    nodeOutcomes: RB_DEPENDENCY_REGISTRY.map((registryEntry) => ({
      nodeId: registryEntry.nodeId,
      nodeKind: registryEntry.nodeKind,
      calculationId: registryEntry.calculationId,
      dependencyPopulationKeys: [...registryEntry.dependencies],
      strategy: registryEntry.strategy,
      permissionBefore: permissionForEntry(registryEntry, input.foundation, input.before, beforeControls),
      permissionAfter: permissionForEntry(registryEntry, { ...input.foundation, metrics }, input.after, afterControls),
    })),
  };
}

function validateRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const rawEntry of RB_DEPENDENCY_REGISTRY) {
    const registryEntry: RbDependencyRegistryEntry = rawEntry;
    if (ids.has(registryEntry.nodeId)) errors.push(`duplicate_dependency_node:${registryEntry.nodeId}`);
    ids.add(registryEntry.nodeId);
    if (registryEntry.dependencies.length === 0) errors.push(`dependency_node_has_no_inputs:${registryEntry.nodeId}`);
    if (registryEntry.nodeKind === "fact" && registryEntry.strategy !== "preserve_existing_fact") {
      errors.push(`limited_authority_registry_cannot_derive_fact:${registryEntry.nodeId}`);
    }
    if (registryEntry.nodeKind === "fact"
        && registryEntry.permissionPolicy !== "never_derive_from_limited_authority") {
      errors.push(`limited_authority_registry_cannot_grant_fact_permission:${registryEntry.nodeId}`);
    }
    if (registryEntry.nodeKind === "metric" && !registryEntry.calculationId) {
      errors.push(`metric_dependency_node_requires_calculation_identity:${registryEntry.nodeId}`);
    }
    if (registryEntry.nodeKind !== "metric" && registryEntry.calculationId !== null) {
      errors.push(`non_metric_dependency_node_cannot_register_calculation:${registryEntry.nodeId}`);
    }
    if (registryEntry.nodeKind === "capability") {
      if (!registryEntry.controlIdentity.startsWith("independent_split_population:")) {
        errors.push(`claim_capability_requires_independent_control:${registryEntry.nodeId}`);
      }
      if (registryEntry.forbiddenDependencies.length !== 3) {
        errors.push(`claim_capability_forbidden_dependency_contract_incomplete:${registryEntry.nodeId}`);
      }
    }
  }
  return errors.sort();
}

function permissions(
  foundation: Pick<CanonicalEconomicsV2Foundation, "metrics">,
  populations: CanonicalEconomicsV2FinancialPopulations,
  controls: RbDependencyRelationshipControl[],
) {
  return {
    headlineEffectiveRate: permissionForEntry(entry("metric_v2_headline_effective_rate"), foundation, populations, controls),
    grossBasedRateDiagnostic: permissionForEntry(entry("metric_v2_gross_based_rate_diagnostic"), foundation, populations, controls),
    headlineAverageTicket: permissionForEntry(entry("metric_v2_headline_average_ticket"), foundation, populations, controls),
    grossRefundNetControl: permissionForEntry(entry("gross_refund_equals_net_submitted"), foundation, populations, controls),
    submittedCountControl: permissionForEntry(entry("gross_refund_count_equals_submitted_count"), foundation, populations, controls),
  };
}

function permissionForEntry(
  registryEntry: (typeof RB_DEPENDENCY_REGISTRY)[number],
  foundation: Pick<CanonicalEconomicsV2Foundation, "metrics">,
  populations: CanonicalEconomicsV2FinancialPopulations,
  controls: RbDependencyRelationshipControl[],
): RbDependencyPermission {
  const dependencies = [...registryEntry.dependencies];
  switch (registryEntry.permissionPolicy) {
    case "never_derive_from_limited_authority":
      return permission("prohibited", dependencies, ["limited_authority_cannot_derive_adjacent_canonical_fact"]);
    case "preserve_existing_permission":
      return permission("preserved", dependencies, ["approved_overlay_has_no_dependency_edge_to_headline_effective_rate"]);
    case "configured_inputs_required": {
      if (foundation.metrics.grossBasedRateDiagnostic === null) {
        return permission("not_configured", dependencies, ["existing_rb_gross_rate_configuration_gate_preserved"]);
      }
      return moneyValue(populations.grossSaleVolume) !== null
        && moneyValue(populations.totalStatementProcessingFees) !== null
        ? permission("permitted", dependencies, ["configured_inputs_available"])
        : permission("withheld", dependencies, ["configured_metric_inputs_unavailable"]);
    }
    case "available_inputs_required": {
      const grossAvailable = moneyValue(populations.grossSaleVolume) !== null;
      const grossCount = countValue(populations.grossSaleTransactionCount);
      return grossAvailable && grossCount !== null && grossCount > 0
        ? permission("permitted", dependencies, ["gross_amount_and_positive_gross_count_available"])
        : permission("withheld", dependencies, [!grossAvailable ? "gross_sale_volume_unavailable"
          : grossCount === null ? "gross_sale_transaction_count_unavailable" : "gross_sale_transaction_count_zero"]);
    }
    case "control_inputs_required": {
      const control = controls.find((item) => item.id === registryEntry.nodeId);
      if (!control) return permission("withheld", dependencies, ["registered_control_not_evaluated"]);
      return permission(control.state === "unresolved" ? "withheld" : "permitted", dependencies,
        [control.state === "unresolved" ? "control_inputs_unavailable" : `control_evaluation_${control.state}`]);
    }
    case "claim_specific_evidence_required":
      return permission("preserved", dependencies,
        ["claim_capability_is_evaluated_from_registered_document_ir_control", "funding_ledger_not_a_dependency"]);
  }
}

function evaluateControl(
  registryEntry: ReturnType<typeof controlEntries>[number],
  populations: CanonicalEconomicsV2FinancialPopulations,
): RbDependencyRelationshipControl {
  if (registryEntry.strategy === "subtract_money_equals_money") {
    const gross = moneyValue(populations.grossSaleVolume);
    const refund = moneyValue(populations.refundVolume);
    const net = moneyValue(populations.canonicalNetSubmittedCardVolume);
    return {
      id: "gross_refund_equals_net_submitted",
      state: gross === null || refund === null || net === null ? "unresolved" : gross - refund === net ? "pass" : "fail",
      dependencyPopulationKeys: [...registryEntry.dependencies],
      observedLeft: gross === null || refund === null ? null : gross - refund,
      observedRight: net,
    };
  }
  const grossCount = countValue(populations.grossSaleTransactionCount);
  const refundCount = countValue(populations.refundTransactionCount);
  const submittedCount = countValue(populations.submittedTransactionCount);
  return {
    id: "gross_refund_count_equals_submitted_count",
    state: grossCount === null || refundCount === null || submittedCount === null
      ? "unresolved" : grossCount + refundCount === submittedCount ? "pass" : "fail",
    dependencyPopulationKeys: [...registryEntry.dependencies],
    observedLeft: grossCount === null || refundCount === null ? null : grossCount + refundCount,
    observedRight: submittedCount,
  };
}

function replaceRegisteredCalculations(
  calculations: CanonicalEconomicsV2Calculation[],
  replacements: Array<{
    entry: (typeof RB_DEPENDENCY_REGISTRY)[number];
    calculation: CanonicalEconomicsV2Calculation | null;
    configured: boolean;
  }>,
): CanonicalEconomicsV2Calculation[] {
  const byResultRef = new Map<string, CanonicalEconomicsV2Calculation | null>(replacements.filter((item) => item.configured)
    .map((item) => [item.entry.nodeId, item.calculation]));
  const inserted = new Set<string>();
  const output: CanonicalEconomicsV2Calculation[] = [];
  for (const calculation of structuredClone(calculations)) {
    if (!byResultRef.has(calculation.resultFactRef)) {
      output.push(calculation);
      continue;
    }
    const replacement = byResultRef.get(calculation.resultFactRef);
    inserted.add(calculation.resultFactRef);
    if (replacement) output.push(replacement);
  }
  for (const [resultFactRef, replacement] of byResultRef) {
    if (!inserted.has(resultFactRef) && replacement) output.push(replacement);
  }
  return output;
}

function controlEntries() {
  return RB_DEPENDENCY_REGISTRY.filter((item): item is Extract<(typeof RB_DEPENDENCY_REGISTRY)[number], { nodeKind: "control" }> =>
    item.nodeKind === "control");
}

function claimCapabilityEntries() {
  return RB_DEPENDENCY_REGISTRY.filter((item): item is Extract<(typeof RB_DEPENDENCY_REGISTRY)[number], { nodeKind: "capability" }> =>
    item.nodeKind === "capability");
}

function entry<TId extends (typeof RB_DEPENDENCY_REGISTRY)[number]["nodeId"]>(nodeId: TId) {
  return RB_DEPENDENCY_REGISTRY.find((item) => item.nodeId === nodeId)!;
}

function permission(state: RbDependencyPermission["state"], dependencyPopulationKeys: string[],
  reasonCodes: string[]): RbDependencyPermission {
  return { state, dependencyPopulationKeys, reasonCodes };
}

function moneyValue(fact: CanonicalEconomicsV2FinancialPopulations[keyof CanonicalEconomicsV2FinancialPopulations]): number | null {
  return fact.status === "available" && fact.value !== null && typeof fact.value === "object"
    ? fact.value.amountMinor : null;
}

function countValue(fact: CanonicalEconomicsV2FinancialPopulations[keyof CanonicalEconomicsV2FinancialPopulations]): number | null {
  return fact.status === "available" && typeof fact.value === "number" ? fact.value : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
